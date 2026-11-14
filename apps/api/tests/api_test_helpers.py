"""バックエンドのテスト共通のヘルパー。

conftest.py にしないのは、契約テスト（tests/contract/conftest.py）と同じセッションで集めたときに
`from conftest import ...` の名前がぶつかるため。
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
DOMAIN_EXAMPLES = REPO_ROOT / "contracts" / "domain" / "examples"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def to_input(item: dict[str, Any]) -> dict[str, Any]:
    """保存済みの食品（例ファイル）から、保存 API が受け取る食品の入力（FoodItemInput）を作る。"""
    out = {k: item[k] for k in ("item_id", "name", "source", "reference", "estimate_detail")}
    out["portion"] = {k: item["portion"][k] for k in ("mode", "fraction", "pieces")}
    return out


def assert_same(actual: Any, expected: Any, path: str = "$") -> None:
    """dict・list を再帰的に比べる。数値は誤差 1e-9 まで同じとみなす。"""
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: dict ではない（{actual!r}）"
        assert set(actual) == set(expected), f"{path}: キーが違う {sorted(set(actual) ^ set(expected))}"
        for k in expected:
            assert_same(actual[k], expected[k], f"{path}.{k}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), f"{path}: 件数が違う"
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_same(a, e, f"{path}[{i}]")
    elif isinstance(expected, (int, float)) and not isinstance(expected, bool):
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool), f"{path}: 数値ではない（{actual!r}）"
        assert math.isclose(actual, expected, abs_tol=1e-9), f"{path}: {actual} != {expected}"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture(*parts: str) -> Any:
    return load_json(FIXTURES.joinpath(*parts))


def _api_registry() -> tuple[Any, str]:
    """contracts/api/openapi.yaml と、そこから参照するスキーマを解決できるレジストリ（契約テストと同じ仕組み）。"""
    import yaml
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT202012

    openapi = REPO_ROOT / "contracts" / "api" / "openapi.yaml"
    spec = yaml.safe_load(openapi.read_text(encoding="utf-8"))
    resources = [(openapi.as_uri(), Resource(contents=spec, specification=DRAFT202012))]
    for path in list((REPO_ROOT / "contracts").glob("*/*.schema.json")) + list(
        (REPO_ROOT / "contracts" / "llm").glob("*/*.schema.json")
    ):
        contents = load_json(path)
        res = Resource(contents=contents, specification=DRAFT202012)
        resources.append((path.as_uri(), res))
        if "$id" in contents:
            resources.append((contents["$id"], res))
    return Registry().with_resources(resources), openapi.as_uri()


def api_schema_errors(component: str, data: Any) -> list[str]:
    """contracts/api/openapi.yaml の components.schemas[component] での検証エラー（空なら適合）。"""
    from jsonschema import Draft202012Validator

    registry, uri = _api_registry()
    validator = Draft202012Validator({"$ref": f"{uri}#/components/schemas/{component}"}, registry=registry)
    return [f"{list(e.absolute_path)}: {e.message}" for e in validator.iter_errors(data)]


# ---- API テスト用 ----

USER_A = "user-a"
USER_B = "user-b"
NOW = "2026-11-13T10:00:00Z"


def auth(sub: str = USER_A) -> dict[str, str]:
    """API Gateway の JWT オーソライザーが検証した要求の文脈（Lambda Web Adapter が渡すヘッダー、F-001-01）。"""
    return {"x-amzn-request-context": json.dumps({"authorizer": {"jwt": {"claims": {"sub": sub}}}})}


def item_inputs(example_name: str) -> list[dict[str, Any]]:
    """contracts/domain の valid の例から、保存 API の食品の入力を作る。"""
    return [to_input(i) for i in load_json(DOMAIN_EXAMPLES / "valid" / example_name)["items"]]


def meal_id(n: int) -> str:
    return f"0190f3a2-7c1e-7a01-8b2c-{0xA00 + n:012x}"


class FakeEstimator:
    """Claude の代わり。用途ごとに、返す出力（または投げる例外）を決めておく。"""

    def __init__(self, outputs: dict[str, Any] | None = None, error: Exception | None = None) -> None:
        self.outputs = outputs or {}
        self.error = error
        self.calls: list[tuple[str, dict[str, str]]] = []

    def estimate(self, usecase: str, image: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
        self.calls.append((usecase, dict(image)))
        if self.error:
            raise self.error
        fx = self.outputs[usecase]
        meta = {k: fx["meta"][k] for k in ("model", "prompt_version", "schema_id")}
        return fx["output"], meta


class FakeProducts:
    """Open Food Facts の代わり。番号 → 応答（なければ None）。"""

    def __init__(self, payloads: dict[str, Any] | None = None, error: Exception | None = None) -> None:
        self.payloads = payloads or {}
        self.error = error

    def fetch(self, product_code: str) -> dict[str, Any] | None:
        if self.error:
            raise self.error
        return self.payloads.get(product_code)  # type: ignore[no-any-return]


def meal_schema_errors(meal: Any) -> list[str]:
    """contracts/domain/meal.schema.json での検証エラー（空なら適合）。"""
    from jsonschema import Draft202012Validator

    schema = load_json(REPO_ROOT / "contracts" / "domain" / "meal.schema.json")
    return [f"{list(e.absolute_path)}: {e.message}" for e in Draft202012Validator(schema).iter_errors(meal)]
