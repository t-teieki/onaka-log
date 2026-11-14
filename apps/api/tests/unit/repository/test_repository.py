"""食事の保存先の約束（MealRepository）。メモリと DynamoDB（DynamoDB Local）の両方で同じテストを流す。

DynamoDB Local は環境変数 ONAKA_TEST_DYNAMODB_ENDPOINT（例 http://localhost:8000）で指定する。
指定がなければ DynamoDB の分は skip（CI では ONAKA_REQUIRE_DYNAMODB=1 にして、skip ではなく失敗にする）。
"""

from __future__ import annotations

import copy
import os
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from api_test_helpers import DOMAIN_EXAMPLES, assert_same, load_json

from onaka_api.domain import VersionConflict
from onaka_api.repository import MealAlreadyExists
from onaka_api.repository.dynamodb import DynamoMealRepository, create_table, sort_key
from onaka_api.repository.memory import InMemoryMealRepository


def example(name: str) -> dict[str, Any]:
    return load_json(DOMAIN_EXAMPLES / "valid" / name)  # type: ignore[no-any-return]


@pytest.fixture(params=["memory", "dynamodb"])
def repo(request: pytest.FixtureRequest) -> Iterator[Any]:
    if request.param == "memory":
        yield InMemoryMealRepository()
        return
    endpoint = os.environ.get("ONAKA_TEST_DYNAMODB_ENDPOINT")
    if not endpoint:
        if os.environ.get("ONAKA_REQUIRE_DYNAMODB"):
            pytest.fail("ONAKA_REQUIRE_DYNAMODB なのに ONAKA_TEST_DYNAMODB_ENDPOINT がない")
        pytest.skip("DynamoDB Local がない（ONAKA_TEST_DYNAMODB_ENDPOINT を設定すると動く）")
    import boto3

    client = boto3.client(
        "dynamodb",
        endpoint_url=endpoint,
        region_name="ap-northeast-1",
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )
    table = f"onaka-log-test-{uuid.uuid4().hex[:8]}"
    create_table(client, table)
    try:
        yield DynamoMealRepository(client, table)
    finally:
        client.delete_table(TableName=table)


def at(
    meal: dict[str, Any],
    *,
    user: str = "u1",
    meal_id: str | None = None,
    eaten_at: str | None = None,
    record_date: str | None = None,
) -> dict[str, Any]:
    m = copy.deepcopy(meal)
    m["user_id"] = user
    if meal_id:
        m["meal_id"] = meal_id
    if eaten_at:
        m["eaten_at"] = eaten_at
    if record_date:
        m["record_date"] = record_date
    return m


@pytest.mark.spec("F-030-03", "F-031-04")
def test_create_and_get_round_trip_keeps_values(repo: Any) -> None:
    for name in ("meal-photo-plus-barcode.json", "meal-label-ocr-columns-and-null.json", "meal-barcode-net-known.json"):
        meal = at(example(name))
        repo.create(meal)
        got = repo.get("u1", meal["record_date"], meal["meal_id"])
        assert_same(got, meal)  # 数値（小数・整数）・null・入れ子がそのまま戻る


@pytest.mark.spec("F-030-04")
def test_create_twice_is_rejected(repo: Any) -> None:
    meal = at(example("meal-manual.json"))
    repo.create(meal)
    with pytest.raises(MealAlreadyExists):
        repo.create(meal)


@pytest.mark.spec("F-031-01", "F-031-05")
def test_list_day_is_sorted_and_scoped(repo: Any) -> None:
    base = example("meal-manual.json")
    late = at(base, meal_id="0190f3a2-7c1e-7a01-8b2c-000000000b01", eaten_at="2026-11-13T21:00:00+09:00")
    early = at(base, meal_id="0190f3a2-7c1e-7a01-8b2c-000000000b02", eaten_at="2026-11-13T07:00:00+09:00")
    night = at(
        base,
        meal_id="0190f3a2-7c1e-7a01-8b2c-000000000b03",
        eaten_at="2026-11-14T02:00:00+09:00",
        record_date="2026-11-13",
    )  # 4:00 前は前日の記録
    next_day = at(
        base,
        meal_id="0190f3a2-7c1e-7a01-8b2c-000000000b04",
        eaten_at="2026-11-14T08:00:00+09:00",
        record_date="2026-11-14",
    )
    other_user = at(base, user="u2", meal_id="0190f3a2-7c1e-7a01-8b2c-000000000b05")
    for m in (late, early, night, next_day, other_user):
        repo.create(m)
    assert [m["meal_id"] for m in repo.list_day("u1", "2026-11-13")] == [
        early["meal_id"],
        late["meal_id"],
        night["meal_id"],
    ]
    assert repo.list_day("u1", "2026-11-12") == []
    assert repo.get("u2", "2026-11-13", late["meal_id"]) is None  # ほかの利用者からは見えない
    assert repo.get("u1", "2026-11-14", late["meal_id"]) is None  # 記録日が違えば見つからない


@pytest.mark.spec("F-030-07")
def test_replace_checks_version(repo: Any) -> None:
    meal = at(example("meal-photo-fraction.json"))
    repo.create(meal)
    updated = copy.deepcopy(meal)
    updated["version"] = 2
    updated["items"][0]["name"] = "更新後"
    repo.replace(updated, expected_version=1)
    assert repo.get("u1", meal["record_date"], meal["meal_id"])["items"][0]["name"] == "更新後"
    stale = copy.deepcopy(meal)
    stale["version"] = 2
    with pytest.raises(VersionConflict):
        repo.replace(stale, expected_version=1)  # すでに version 2 になっている


@pytest.mark.spec("F-032-01")
def test_delete(repo: Any) -> None:
    meal = at(example("meal-manual.json"))
    repo.create(meal)
    assert repo.delete("u2", meal["record_date"], meal["meal_id"]) is False  # ほかの利用者は消せない
    assert repo.delete("u1", meal["record_date"], meal["meal_id"]) is True
    assert repo.get("u1", meal["record_date"], meal["meal_id"]) is None
    assert repo.delete("u1", meal["record_date"], meal["meal_id"]) is False


def test_sort_key_format() -> None:
    meal = example("meal-barcode-net-unknown.json")  # 2026-11-14T01:20:00+09:00 → 記録日 11/13
    assert sort_key(meal) == f"MEAL#2026-11-13#01:20:00#{meal['meal_id']}"
