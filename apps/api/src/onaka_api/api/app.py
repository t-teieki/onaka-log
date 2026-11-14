"""FastAPI のアプリを組み立てる。依存（保存先・Claude・OFF・時計）は外から渡し、テストで差し替える。

要求の本文は contracts（openapi.yaml・llm の input スキーマ）を jsonschema で直接使って検証する
（Pydantic のモデルを別に書かず、契約を唯一の正にする）。応答の形は契約テストと API テストで確かめる。
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any, Protocol

import yaml
from fastapi import Body, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from onaka_api import domain
from onaka_api.domain import DomainError, ItemAlreadyExists, ItemNotFound, RuleViolation, VersionConflict
from onaka_api.estimation import (
    EstimationFailed,
    UpstreamUnavailable,
    contracts_dir,
    label_response,
    photo_response,
    product_response,
)
from onaka_api.repository import MealAlreadyExists, MealRepository

MAX_IMAGE_CHARS = 5_000_000  # F-012-09・F-013-09
log = logging.getLogger(__name__)

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_UUID7 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
_PRODUCT_CODE = re.compile(r"^\d{8,14}$")


class Estimator(Protocol):
    def estimate(self, usecase: str, image: Mapping[str, str]) -> tuple[dict[str, Any], dict[str, Any]]: ...


class ProductSource(Protocol):
    def fetch(self, product_code: str) -> dict[str, Any] | None: ...


@dataclass
class Deps:
    repo: MealRepository
    estimator: Estimator
    products: ProductSource
    now: Callable[[], str]  # UTC の ISO 8601（例 2026-11-13T03:30:07Z）
    local_user_id: str | None = None  # ローカル開発のときだけ（F-001-03）


class ApiError(Exception):
    """API のエラー（docs/02_design/api.md §5）。"""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---- 契約による要求の検証 ----


@lru_cache(maxsize=1)
def _registry_and_openapi_uri() -> tuple[Registry[Any], str]:
    base = contracts_dir()
    openapi_path = base / "api" / "openapi.yaml"
    spec = yaml.safe_load(openapi_path.read_text(encoding="utf-8"))
    resources: list[tuple[str, Resource[Any]]] = [(openapi_path.as_uri(), DRAFT202012.create_resource(spec))]
    for path in list(base.glob("*/*.schema.json")) + list((base / "llm").glob("*/*.schema.json")):
        contents = json.loads(path.read_text(encoding="utf-8"))
        res = DRAFT202012.create_resource(contents)
        resources.append((path.as_uri(), res))
        if "$id" in contents:
            resources.append((contents["$id"], res))
    return Registry().with_resources(resources), openapi_path.as_uri()


@lru_cache(maxsize=16)
def _validator(ref: str) -> Draft202012Validator:
    registry, openapi_uri = _registry_and_openapi_uri()
    if ref.startswith("#"):
        ref = f"{openapi_uri}{ref}"
    return Draft202012Validator({"$ref": ref}, registry=registry)


def _validate(ref: str, body: Any) -> None:
    errors = sorted(_validator(ref).iter_errors(body), key=lambda e: list(e.absolute_path))
    if errors:
        e = errors[0]
        where = "/".join(str(p) for p in e.absolute_path) or "(本文)"
        raise ApiError(400, "validation_error", f"{where}: {e.message}"[:300])


def _image_input(body: Any, usecase: str) -> Mapping[str, str]:
    data = (
        body.get("image", {}).get("data_base64")
        if isinstance(body, dict) and isinstance(body.get("image"), dict)
        else None
    )
    if isinstance(data, str) and len(data) > MAX_IMAGE_CHARS:
        raise ApiError(413, "payload_too_large", "画像が大きすぎる")
    _validate((contracts_dir() / "llm" / usecase / "input.schema.json").as_uri(), body)
    return body["image"]  # type: ignore[no-any-return]


def _check(pattern: re.Pattern[str], value: str, name: str) -> str:
    if not pattern.match(value):
        raise ApiError(400, "validation_error", f"{name} の形が違う")
    return value


# ---- 利用者 ID（F-001） ----


def _user_id(request: Request, local_user_id: str | None) -> str:
    raw = request.headers.get("x-amzn-request-context")
    if raw:
        try:
            sub = json.loads(raw)["authorizer"]["jwt"]["claims"]["sub"]
        except (ValueError, KeyError, TypeError):
            sub = None
        if isinstance(sub, str) and sub:
            return sub
    elif local_user_id:
        return local_user_id
    raise ApiError(401, "unauthorized", "利用者を確認できない")


# ---- 応答 ----


def _day_summary(record_date: str, meals: list[dict[str, Any]]) -> dict[str, Any]:
    totals = {n: domain.round1(sum((m["totals"][n] for m in meals), 0.0)) if meals else 0 for n in domain.NUTRIENTS}
    incomplete = [n for n in domain.NUTRIENTS if any(n in m["totals_incomplete"] for m in meals)]
    return {"record_date": record_date, "totals": totals, "totals_incomplete": incomplete, "meals": meals}


def create_app(deps: Deps) -> FastAPI:
    app = FastAPI(title="onaka-log API", version="0.1.0")

    @app.exception_handler(ApiError)
    def _api_error(_: Request, e: ApiError) -> JSONResponse:
        return JSONResponse({"error": {"code": e.code, "message": e.message}}, status_code=e.status)

    @app.exception_handler(RequestValidationError)
    def _request_invalid(_: Request, e: RequestValidationError) -> JSONResponse:
        return JSONResponse({"error": {"code": "validation_error", "message": "要求の形が違う"}}, status_code=400)

    @app.exception_handler(DomainError)
    def _domain_error(_: Request, e: DomainError) -> JSONResponse:
        status = {VersionConflict: 409, ItemAlreadyExists: 409, ItemNotFound: 404}.get(type(e), 400)
        message = f"{e.rule}: {e}" if isinstance(e, RuleViolation) and e.rule else str(e)
        return JSONResponse({"error": {"code": e.code, "message": message}}, status_code=status)

    @app.exception_handler(MealAlreadyExists)
    def _meal_exists(_: Request, e: MealAlreadyExists) -> JSONResponse:
        return JSONResponse({"error": {"code": e.code, "message": "同じ meal_id の食事がある"}}, status_code=409)

    @app.exception_handler(EstimationFailed)
    def _estimation_failed(_: Request, e: EstimationFailed) -> JSONResponse:
        return JSONResponse({"error": {"code": e.code, "message": str(e)[:300]}}, status_code=422)

    @app.exception_handler(UpstreamUnavailable)
    def _upstream(_: Request, e: UpstreamUnavailable) -> JSONResponse:
        return JSONResponse({"error": {"code": e.code, "message": str(e)[:300]}}, status_code=502)

    @app.exception_handler(Exception)
    def _internal(_: Request, e: Exception) -> JSONResponse:
        log.exception("internal_error error=%s", type(e).__name__)
        return JSONResponse({"error": {"code": "internal_error", "message": "内部エラー"}}, status_code=500)

    def user(request: Request) -> str:
        return _user_id(request, deps.local_user_id)

    def find_meal(user_id: str, record_date: str, meal_id: str) -> dict[str, Any]:
        _check(_DATE, record_date, "record_date")
        _check(_UUID7, meal_id, "meal_id")
        meal = deps.repo.get(user_id, record_date, meal_id)
        if meal is None:
            raise ApiError(404, "not_found", "食事がない")
        return meal

    # ---- 推定・照合 ----

    @app.post("/v1/estimates/label", tags=["estimates"], operation_id="estimateLabel")
    def estimate_label(request: Request, body: Annotated[Any, Body()] = None) -> Any:
        user(request)
        image = _image_input(body, "nutrition-label-ocr")
        output, estimation = deps.estimator.estimate("nutrition-label-ocr", image)
        return label_response(output, estimation=estimation)

    @app.post("/v1/estimates/photo", tags=["estimates"], operation_id="estimatePhoto")
    def estimate_photo(request: Request, body: Annotated[Any, Body()] = None) -> Any:
        user(request)
        image = _image_input(body, "food-photo-estimate")
        output, estimation = deps.estimator.estimate("food-photo-estimate", image)
        return photo_response(output, estimation=estimation)

    @app.get("/v1/products/{product_code}", tags=["estimates"], operation_id="lookupProduct")
    def lookup_product(request: Request, product_code: str) -> Any:
        user(request)
        _check(_PRODUCT_CODE, product_code, "product_code")
        return product_response(product_code, deps.products.fetch(product_code))

    # ---- 食事 ----

    @app.post("/v1/meals", tags=["meals"], operation_id="createMeal", status_code=201)
    def create_meal(request: Request, body: Annotated[Any, Body()] = None) -> Any:
        user_id = user(request)
        _validate("#/components/schemas/MealCreateRequest", body)
        meal = domain.create_meal(
            meal_id=body["meal_id"], user_id=user_id, eaten_at=body["eaten_at"], items=body["items"], now=deps.now()
        )
        deps.repo.create(meal)
        return JSONResponse(meal, status_code=201)

    @app.get("/v1/days/{record_date}", tags=["meals"], operation_id="getDay")
    def get_day(request: Request, record_date: str) -> Any:
        user_id = user(request)
        _check(_DATE, record_date, "record_date")
        return _day_summary(record_date, deps.repo.list_day(user_id, record_date))

    @app.get("/v1/days/{record_date}/meals/{meal_id}", tags=["meals"], operation_id="getMeal")
    def get_meal(request: Request, record_date: str, meal_id: str) -> Any:
        return find_meal(user(request), record_date, meal_id)

    @app.delete("/v1/days/{record_date}/meals/{meal_id}", tags=["meals"], operation_id="deleteMeal", status_code=204)
    def delete_meal(request: Request, record_date: str, meal_id: str) -> Response:
        user_id = user(request)
        _check(_DATE, record_date, "record_date")
        _check(_UUID7, meal_id, "meal_id")
        if not deps.repo.delete(user_id, record_date, meal_id):
            raise ApiError(404, "not_found", "食事がない")
        return Response(status_code=204)

    @app.post("/v1/days/{record_date}/meals/{meal_id}/items", tags=["meals"], operation_id="addMealItem")
    def add_item(request: Request, record_date: str, meal_id: str, body: Annotated[Any, Body()] = None) -> Any:
        user_id = user(request)
        _validate("#/components/schemas/AddItemRequest", body)
        meal = find_meal(user_id, record_date, meal_id)
        updated = domain.add_item(meal, body["item"], expected_version=body["expected_version"], now=deps.now())
        deps.repo.replace(updated, expected_version=body["expected_version"])
        return updated

    @app.delete("/v1/days/{record_date}/meals/{meal_id}/items/{item_id}", tags=["meals"], operation_id="deleteMealItem")
    def delete_item(request: Request, record_date: str, meal_id: str, item_id: str, expected_version: str = "") -> Any:
        user_id = user(request)
        _check(_UUID7, item_id, "item_id")
        if not expected_version.isdigit() or int(expected_version) < 1:
            raise ApiError(400, "validation_error", "expected_version は 1 以上の整数")
        version = int(expected_version)
        meal = find_meal(user_id, record_date, meal_id)
        updated = domain.remove_item(meal, item_id, expected_version=version, now=deps.now())
        if updated is None:
            deps.repo.delete(user_id, record_date, meal_id)
            return {"meal_deleted": True, "meal": None}
        deps.repo.replace(updated, expected_version=version)
        return {"meal_deleted": False, "meal": updated}

    return app
