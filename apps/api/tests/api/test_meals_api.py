"""食事の API（F-030・F-031・F-032・F-001）。保存先はメモリ、時計は固定。応答は OpenAPI の契約で検証する。"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from api_test_helpers import (
    NOW,
    USER_B,
    FakeEstimator,
    FakeProducts,
    api_schema_errors,
    auth,
    item_inputs,
    meal_id,
    meal_schema_errors,
)
from fastapi.testclient import TestClient

from onaka_api.api.app import Deps, create_app
from onaka_api.repository.memory import InMemoryMealRepository


@pytest.fixture
def client() -> TestClient:
    deps = Deps(repo=InMemoryMealRepository(), estimator=FakeEstimator(), products=FakeProducts(), now=lambda: NOW)
    return TestClient(create_app(deps))


def create(
    client: TestClient,
    n: int = 1,
    items: list[dict[str, Any]] | None = None,
    eaten_at: str = "2026-11-13T12:30:00+09:00",
    user: str = "user-a",
) -> Any:
    body = {
        "meal_id": meal_id(n),
        "eaten_at": eaten_at,
        "items": items if items is not None else item_inputs("meal-photo-fraction.json"),
    }
    return client.post("/v1/meals", json=body, headers=auth(user))


def error_code(res: Any) -> str:
    assert api_schema_errors("Error", res.json()) == [], res.json()
    return res.json()["error"]["code"]  # type: ignore[no-any-return]


# ---- F-030 保存 ----


@pytest.mark.spec("F-030-02", "F-030-03")
def test_create_returns_computed_meal(client: TestClient) -> None:
    res = create(client, items=item_inputs("meal-photo-plus-barcode.json"))
    assert res.status_code == 201, res.text
    meal = res.json()
    assert meal_schema_errors(meal) == []  # 201 の本文は contracts/domain/meal.schema.json
    assert meal["user_id"] == "user-a" and meal["version"] == 1
    assert meal["created_at"] == meal["updated_at"] == NOW
    assert meal["record_date"] == "2026-11-13"
    assert meal["items"][3]["portion"]["multiplier"] == 5.0  # 500ml ÷ 100（バックエンドが計算）
    assert meal["totals"]["energy_kcal"] == 702.0


@pytest.mark.spec("F-030-01")
@pytest.mark.parametrize(
    "broken",
    [
        lambda b: b.pop("eaten_at"),
        lambda b: b.update(items=[]),
        lambda b: b["items"][0]["portion"].update(multiplier=1),  # 倍率はアプリから送らない
        lambda b: b.update(meal_id="not-a-uuid"),
        lambda b: b.update(eaten_at="2026-11-13T03:30:00Z"),  # 日本時間でない
    ],
)
def test_create_rejects_invalid_body(client: TestClient, broken: Any) -> None:
    body = {"meal_id": meal_id(1), "eaten_at": "2026-11-13T12:30:00+09:00", "items": item_inputs("meal-manual.json")}
    broken(body)
    res = client.post("/v1/meals", json=body, headers=auth())
    assert res.status_code == 400 and error_code(res) == "validation_error"


@pytest.mark.spec("F-030-02")
def test_create_rejects_domain_rule_violation(client: TestClient) -> None:
    items = item_inputs("meal-manual.json")
    items[0]["reference"]["nutrients"]["fat_g"] = None  # 手入力の不明は不可（DM-09）
    res = create(client, items=items)
    assert res.status_code == 400 and error_code(res) == "validation_error"
    assert "DM-09" in res.json()["error"]["message"]


@pytest.mark.spec("F-030-04")
def test_create_twice_is_conflict(client: TestClient) -> None:
    assert create(client).status_code == 201
    res = create(client)
    assert res.status_code == 409 and error_code(res) == "meal_already_exists"


@pytest.mark.spec("F-030-05", "F-030-06")
def test_add_item(client: TestClient) -> None:
    items = item_inputs("meal-photo-plus-barcode.json")
    create(client, items=items[:3])
    path = f"/v1/days/2026-11-13/meals/{meal_id(1)}/items"
    res = client.post(path, json={"expected_version": 1, "item": items[3]}, headers=auth())
    assert res.status_code == 200, res.text
    assert res.json()["version"] == 2 and len(res.json()["items"]) == 4
    # 同じ item_id の再送、古い版、ない食事
    again = client.post(path, json={"expected_version": 2, "item": items[3]}, headers=auth())
    assert again.status_code == 409 and error_code(again) == "item_already_exists"
    stale = client.post(path, json={"expected_version": 1, "item": items[0] | {"item_id": meal_id(99)}}, headers=auth())
    assert stale.status_code == 409 and error_code(stale) == "version_conflict"
    missing = client.post(
        f"/v1/days/2026-11-13/meals/{meal_id(2)}/items", json={"expected_version": 1, "item": items[3]}, headers=auth()
    )
    assert missing.status_code == 404 and error_code(missing) == "not_found"
    bad = client.post(path, json={"item": items[3]}, headers=auth())  # expected_version がない
    assert bad.status_code == 400 and error_code(bad) == "validation_error"


# ---- F-031 一覧・1件 ----


@pytest.mark.spec("F-031-01", "F-031-02")
def test_day_summary(client: TestClient) -> None:
    create(client, n=1, eaten_at="2026-11-13T19:00:00+09:00", items=item_inputs("meal-photo-fraction.json"))
    create(client, n=2, eaten_at="2026-11-13T08:00:00+09:00", items=item_inputs("meal-label-ocr-columns-and-null.json"))
    create(client, n=3, eaten_at="2026-11-14T02:00:00+09:00", items=item_inputs("meal-manual.json"))  # 前日の記録
    res = client.get("/v1/days/2026-11-13", headers=auth())
    assert res.status_code == 200
    day = res.json()
    assert api_schema_errors("DaySummary", day) == []
    assert [m["meal_id"] for m in day["meals"]] == [meal_id(2), meal_id(1), meal_id(3)]
    assert day["totals"]["energy_kcal"] == pytest.approx(190.0 + 357.0 + 150.0)
    assert day["totals_incomplete"] == ["fat_g"]  # OCR の野菜ジュースの脂質が不明


@pytest.mark.spec("F-031-03")
def test_empty_day(client: TestClient) -> None:
    res = client.get("/v1/days/2026-11-12", headers=auth())
    assert res.status_code == 200
    assert res.json() == {
        "record_date": "2026-11-12",
        "totals": {"energy_kcal": 0, "protein_g": 0, "fat_g": 0, "carbohydrate_g": 0},
        "totals_incomplete": [],
        "meals": [],
    }


@pytest.mark.spec("F-031-04", "F-031-05")
def test_get_meal_and_isolation(client: TestClient) -> None:
    create(client)
    ok = client.get(f"/v1/days/2026-11-13/meals/{meal_id(1)}", headers=auth())
    assert ok.status_code == 200 and ok.json()["meal_id"] == meal_id(1)
    other = client.get(f"/v1/days/2026-11-13/meals/{meal_id(1)}", headers=auth(USER_B))
    assert other.status_code == 404 and error_code(other) == "not_found"
    assert client.get("/v1/days/2026-11-13", headers=auth(USER_B)).json()["meals"] == []


@pytest.mark.spec("F-031-06")
def test_bad_record_date(client: TestClient) -> None:
    res = client.get("/v1/days/2026-1-3", headers=auth())
    assert res.status_code == 400 and error_code(res) == "validation_error"


# ---- F-032 削除 ----


@pytest.mark.spec("F-032-01", "F-032-05")
def test_delete_meal(client: TestClient) -> None:
    create(client)
    path = f"/v1/days/2026-11-13/meals/{meal_id(1)}"
    assert client.delete(path, headers=auth(USER_B)).status_code == 404  # ほかの利用者は消せない
    res = client.delete(path, headers=auth())
    assert res.status_code == 204 and res.content == b""
    again = client.delete(path, headers=auth())
    assert again.status_code == 404 and error_code(again) == "not_found"


@pytest.mark.spec("F-032-02", "F-032-03", "F-032-04")
def test_delete_items(client: TestClient) -> None:
    items = item_inputs("meal-photo-plus-barcode.json")[:2]
    create(client, items=items)
    base = f"/v1/days/2026-11-13/meals/{meal_id(1)}/items"
    res = client.delete(f"{base}/{items[0]['item_id']}?expected_version=1", headers=auth())
    assert res.status_code == 200, res.text
    body = res.json()
    assert api_schema_errors("DeleteItemResponse", body) == []
    assert body["meal_deleted"] is False and body["meal"]["version"] == 2
    stale = client.delete(f"{base}/{items[1]['item_id']}?expected_version=1", headers=auth())
    assert stale.status_code == 409 and error_code(stale) == "version_conflict"
    missing = client.delete(f"{base}/{meal_id(77)}?expected_version=2", headers=auth())
    assert missing.status_code == 404 and error_code(missing) == "not_found"
    last = client.delete(f"{base}/{items[1]['item_id']}?expected_version=2", headers=auth())
    assert last.status_code == 200 and last.json() == {"meal_deleted": True, "meal": None}
    assert client.get(f"/v1/days/2026-11-13/meals/{meal_id(1)}", headers=auth()).status_code == 404


# ---- F-001 利用者 ID ----


@pytest.mark.spec("F-001-01", "F-001-02")
@pytest.mark.parametrize(
    "headers",
    [{}, {"x-amzn-request-context": "not json"}, {"x-amzn-request-context": '{"authorizer": {}}'}],
    ids=["none", "broken", "no-claims"],
)
def test_requests_without_user_are_unauthorized(client: TestClient, headers: dict[str, str]) -> None:
    res = client.get("/v1/days/2026-11-13", headers=headers)
    assert res.status_code == 401 and error_code(res) == "unauthorized"


@pytest.mark.spec("F-001-03")
def test_local_user_id_only_when_configured() -> None:
    deps = Deps(
        repo=InMemoryMealRepository(),
        estimator=FakeEstimator(),
        products=FakeProducts(),
        now=lambda: NOW,
        local_user_id="local-dev",
    )
    local = TestClient(create_app(deps))
    body = {"meal_id": meal_id(1), "eaten_at": "2026-11-13T12:30:00+09:00", "items": item_inputs("meal-manual.json")}
    res = local.post("/v1/meals", json=copy.deepcopy(body))  # ヘッダーなし
    assert res.status_code == 201 and res.json()["user_id"] == "local-dev"
