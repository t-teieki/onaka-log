"""ドメイン（onaka_api.domain）の単体テスト。

仕様: docs/02_design/domain-model.md（DM-01〜09）。正解は contracts/domain/examples の valid の例。
契約テストの参照実装（tests/contract/domain_rules.py）は import しない（独立に書いた2つの実装を、同じ例でつなぐ）。
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest
from api_test_helpers import DOMAIN_EXAMPLES, assert_same, load_json, to_input

from onaka_api.domain import (
    ItemAlreadyExists,
    ItemNotFound,
    RuleViolation,
    VersionConflict,
    add_item,
    build_item,
    create_meal,
    multiplier_for,
    record_date_of,
    remove_item,
    round1,
    totals_of,
    whole_multiplier,
)

VALID = sorted((DOMAIN_EXAMPLES / "valid").glob("meal-*.json"))
PHOTO_PLUS = DOMAIN_EXAMPLES / "valid" / "meal-photo-plus-barcode.json"
OCR = DOMAIN_EXAMPLES / "valid" / "meal-label-ocr-columns-and-null.json"
MANUAL = DOMAIN_EXAMPLES / "valid" / "meal-manual.json"
NOW = "2026-11-13T10:00:00Z"


def example(path: Path) -> dict[str, Any]:
    return load_json(path)  # type: ignore[no-any-return]


def inputs_of(path: Path) -> list[dict[str, Any]]:
    return [to_input(i) for i in example(path)["items"]]


def make(items: list[dict[str, Any]], eaten_at: str = "2026-11-13T12:30:00+09:00") -> dict[str, Any]:
    return create_meal(
        meal_id="0190f3a2-7c1e-7a01-8b2c-0000000000ff", user_id="u1", eaten_at=eaten_at, items=items, now=NOW
    )


# ---- 例ファイルを正解として、作った食事が一致する ----


@pytest.mark.spec("DM-01", "DM-02", "DM-03", "DM-04", "F-030")
@pytest.mark.parametrize("path", VALID, ids=[p.name for p in VALID])
def test_builds_same_meal_as_example(path: Path) -> None:
    ex = example(path)
    items = inputs_of(path)
    if ex["version"] == 1:
        meal = create_meal(
            meal_id=ex["meal_id"], user_id=ex["user_id"], eaten_at=ex["eaten_at"], items=items, now=ex["created_at"]
        )
    else:  # 後から食品を足した例（version 2）: 最後の1件以外で作り、最後の1件を足す
        meal = create_meal(
            meal_id=ex["meal_id"],
            user_id=ex["user_id"],
            eaten_at=ex["eaten_at"],
            items=items[:-1],
            now=ex["created_at"],
        )
        meal = add_item(meal, items[-1], expected_version=1, now=ex["updated_at"])
    assert_same(meal, ex)


# ---- DM-01 記録日 ----


@pytest.mark.spec("DM-01")
@pytest.mark.parametrize(
    "eaten_at,expected",
    [
        ("2026-11-14T03:59:59+09:00", "2026-11-13"),  # 4:00 より前は前日
        ("2026-11-14T04:00:00+09:00", "2026-11-14"),
        ("2026-11-13T23:30:00+09:00", "2026-11-13"),
        ("2026-01-01T02:00:00+09:00", "2025-12-31"),  # 年をまたぐ
    ],
)
def test_record_date(eaten_at: str, expected: str) -> None:
    assert record_date_of(eaten_at) == expected


# ---- DM-02・03 丸めと合計 ----


@pytest.mark.spec("DM-02", "DM-03")
@pytest.mark.parametrize(
    "value,expected", [(0.05, 0.1), (0.15, 0.2), (2.25, 2.3), (351.0, 351.0), (0.04, 0.0), (19.95, 20.0)]
)
def test_round1_half_up(value: float, expected: float) -> None:
    assert round1(value) == expected


@pytest.mark.spec("DM-02")
def test_totals_treat_null_as_zero_and_report_incomplete() -> None:
    items = [
        {"nutrients": {"energy_kcal": 100.0, "protein_g": None, "fat_g": 1.0, "carbohydrate_g": None}},
        {"nutrients": {"energy_kcal": 50.15, "protein_g": 2.0, "fat_g": None, "carbohydrate_g": 3.0}},
    ]
    totals, incomplete = totals_of(items)
    assert totals == {"energy_kcal": 150.2, "protein_g": 2.0, "fat_g": 1.0, "carbohydrate_g": 3.0}
    assert incomplete == ["protein_g", "fat_g", "carbohydrate_g"]  # NUTRIENTS の順


@pytest.mark.spec("DM-03")
def test_item_nutrients_keep_null_and_round() -> None:
    item = to_input(example(OCR)["items"][1])  # 脂質が読めなかった野菜ジュース
    built = build_item(item)
    assert built["nutrients"]["fat_g"] is None
    item["portion"] = {"mode": "fraction", "fraction": 0.25, "pieces": None}
    built = build_item(item)
    assert built["nutrients"]["energy_kcal"] == 17.0 and built["nutrients"]["protein_g"] == 0.3  # 1.2 × 0.25


# ---- DM-04 倍率 ----


def ref(
    btype: str,
    status: str | None = None,
    amount: float | None = None,
    unit: str | None = None,
    pieces: int | None = None,
) -> dict[str, Any]:
    net = None if status is None else {"status": status, "amount": amount, "unit": unit, "pieces": pieces}
    return {
        "basis": {"type": btype, "amount": None, "unit": None, "label": None},
        "net_content": net,
        "nutrients": {"energy_kcal": 100.0, "protein_g": 1.0, "fat_g": 1.0, "carbohydrate_g": 1.0},
    }


@pytest.mark.spec("DM-04")
@pytest.mark.parametrize(
    "reference,expected",
    [
        (ref("per_100g", "known", 76, "g"), 0.76),
        (ref("per_100g", "assumed_from_serving", 60, "g"), 0.6),
        (ref("per_100g", "unknown"), 1.0),  # ADR-0009 優先3: 100g 食べたとみなす
        (ref("per_100ml", "known", 200, "g"), 1.0),  # 単位が合わなければ不明と同じ
        (ref("per_100ml", "known", 500, "ml"), 5.0),
        (ref("per_package", "known", 63, "g"), 1.0),
        (ref("per_serving", "unknown"), 1.0),
        (ref("per_piece", "known", None, None, 4), 4.0),
        (ref("per_piece", "unknown"), 1.0),
        (ref("as_estimated"), 1.0),
        (ref("as_entered"), 1.0),
    ],
)
def test_whole_multiplier(reference: dict[str, Any], expected: float) -> None:
    assert whole_multiplier(reference) == pytest.approx(expected)


@pytest.mark.spec("DM-04")
def test_multiplier_by_portion_mode() -> None:
    r = ref("per_100g", "known", 80, "g")
    assert multiplier_for(r, {"mode": "whole", "fraction": None, "pieces": None}) == pytest.approx(0.8)
    assert multiplier_for(r, {"mode": "fraction", "fraction": 0.25, "pieces": None}) == pytest.approx(0.2)
    p = ref("per_piece", "known", None, None, 4)
    assert multiplier_for(p, {"mode": "pieces", "fraction": None, "pieces": 2}) == pytest.approx(2.0)


# ---- DM-05・06・09 入力の検証 ----


def violates(rule: str, item: dict[str, Any]) -> None:
    with pytest.raises(RuleViolation) as e:
        build_item(item)
    assert e.value.rule == rule, f"{e.value.rule}: {e.value}"


@pytest.mark.spec("DM-05")
def test_source_combinations_are_checked() -> None:
    photo, barcode = inputs_of(PHOTO_PLUS)[0], inputs_of(PHOTO_PLUS)[3]
    bad = copy.deepcopy(barcode)
    bad["source"]["product_code"] = None
    violates("DM-05", bad)  # バーコードなのに JAN がない
    bad = copy.deepcopy(photo)
    bad["source"]["estimation"] = None
    violates("DM-05", bad)  # 写真なのにモデルなどの記録がない
    bad = copy.deepcopy(photo)
    bad["reference"]["net_content"] = {"status": "unknown", "amount": None, "unit": None, "pieces": None}
    violates("DM-05", bad)  # 写真に内容量
    bad = copy.deepcopy(photo)
    bad["reference"]["basis"]["type"] = "per_100g"
    violates("DM-05", bad)  # 写真の基準は as_estimated だけ
    bad = copy.deepcopy(barcode)
    bad["source"]["provider"] = "claude"
    violates("DM-05", bad)  # 出どころの提供元が合わない
    bad = copy.deepcopy(photo)
    bad["estimate_detail"] = None
    violates("DM-05", bad)  # 写真なのに量の表現がない


@pytest.mark.spec("DM-06")
def test_portion_combinations_are_checked() -> None:
    photo = inputs_of(PHOTO_PLUS)[0]
    bad = copy.deepcopy(photo)
    bad["portion"] = {"mode": "pieces", "fraction": None, "pieces": 1}
    violates("DM-06", bad)  # 個数は per_piece だけ
    bad = copy.deepcopy(photo)
    bad["portion"] = {"mode": "fraction", "fraction": None, "pieces": None}
    violates("DM-06", bad)  # 割合なのに fraction がない
    manual = inputs_of(MANUAL)[0]
    bad = copy.deepcopy(manual)
    bad["portion"] = {"mode": "fraction", "fraction": 0.5, "pieces": None}
    violates("DM-06", bad)  # 手入力は全部だけ


@pytest.mark.spec("DM-09")
def test_manual_requires_all_nutrients() -> None:
    bad = inputs_of(MANUAL)[0]
    bad["reference"]["nutrients"]["fat_g"] = None
    violates("DM-09", bad)


# ---- DM-07・08 食事の作成・追加・削除 ----


@pytest.mark.spec("DM-07")
def test_duplicate_item_ids_are_rejected() -> None:
    items = inputs_of(PHOTO_PLUS)
    items[1]["item_id"] = items[0]["item_id"]
    with pytest.raises(RuleViolation) as e:
        make(items)
    assert e.value.rule == "DM-07"
    meal = make(inputs_of(PHOTO_PLUS)[:3])
    with pytest.raises(ItemAlreadyExists):
        add_item(meal, inputs_of(PHOTO_PLUS)[0], expected_version=1, now=NOW)  # 再送


@pytest.mark.spec("DM-08")
def test_meal_needs_at_least_one_item() -> None:
    with pytest.raises(RuleViolation) as e:
        make([])
    assert e.value.rule == "DM-08"


@pytest.mark.spec("F-030")
def test_created_meal_has_first_version() -> None:
    meal = make(inputs_of(MANUAL), eaten_at="2026-11-14T01:00:00+09:00")
    assert meal["version"] == 1 and meal["created_at"] == meal["updated_at"] == NOW
    assert meal["user_id"] == "u1" and meal["record_date"] == "2026-11-13"


@pytest.mark.spec("F-030")
def test_add_item_updates_totals_and_version_without_mutating() -> None:
    items = inputs_of(PHOTO_PLUS)
    meal = make(items[:3])
    before = copy.deepcopy(meal)
    added = add_item(meal, items[3], expected_version=1, now="2026-11-13T11:00:00Z")
    assert meal == before  # 元の食事は変えない
    assert added["version"] == 2 and added["updated_at"] == "2026-11-13T11:00:00Z" and added["created_at"] == NOW
    assert len(added["items"]) == 4
    assert added["totals"]["energy_kcal"] == pytest.approx(meal["totals"]["energy_kcal"] + 0.0)  # ウーロン茶は 0kcal
    assert added["totals"]["carbohydrate_g"] == pytest.approx(meal["totals"]["carbohydrate_g"] + 0.5)  # 0.1g × 5


@pytest.mark.spec("F-030")
def test_add_item_checks_version_and_rules() -> None:
    items = inputs_of(PHOTO_PLUS)
    meal = make(items[:3])
    with pytest.raises(VersionConflict):
        add_item(meal, items[3], expected_version=2, now=NOW)
    bad = copy.deepcopy(items[3])
    bad["source"]["product_code"] = None
    with pytest.raises(RuleViolation):
        add_item(meal, bad, expected_version=1, now=NOW)


@pytest.mark.spec("F-032", "DM-08")
def test_remove_item() -> None:
    items = inputs_of(PHOTO_PLUS)
    meal = make(items[:2])
    removed = remove_item(meal, items[0]["item_id"], expected_version=1, now="2026-11-13T12:00:00Z")
    assert removed is not None
    assert [i["item_id"] for i in removed["items"]] == [items[1]["item_id"]]
    assert removed["version"] == 2 and removed["totals"]["energy_kcal"] == pytest.approx(330.0)
    assert len(meal["items"]) == 2  # 元の食事は変えない
    # 最後の1件を消すと食事ごと削除（None）
    assert remove_item(removed, items[1]["item_id"], expected_version=2, now=NOW) is None


@pytest.mark.spec("F-032")
def test_remove_item_errors() -> None:
    meal = make(inputs_of(PHOTO_PLUS)[:2])
    with pytest.raises(ItemNotFound):
        remove_item(meal, "0190f3a2-7c1e-7a01-8b2c-0000000000aa", expected_version=1, now=NOW)
    with pytest.raises(VersionConflict):
        remove_item(meal, inputs_of(PHOTO_PLUS)[0]["item_id"], expected_version=3, now=NOW)
