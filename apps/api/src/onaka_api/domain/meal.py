"""食事と食品のドメインのルール（docs/02_design/domain-model.md、DM-01〜09）。

外部（DB・HTTP・Claude）に依存しない純粋なコード。値は contracts/domain/meal.schema.json と同じ形の dict で扱う。
計算は Decimal で行い、保存・返却する値は小数第1位で四捨五入した float にする（DAT-03）。
入力の dict は変更せず、新しい dict を返す。
"""

from __future__ import annotations

import copy
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from onaka_api.domain.errors import ItemAlreadyExists, ItemNotFound, RuleViolation, VersionConflict

JsonDict = dict[str, Any]

NUTRIENTS: tuple[str, ...] = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")
DAY_BOUNDARY = timedelta(hours=4)

# DM-05: 入力方式ごとの提供元と、使える基準
PROVIDER_BY_METHOD = {"barcode": "open_food_facts", "label_ocr": "claude", "photo": "claude", "manual": "user"}
BASIS_BY_METHOD = {
    "barcode": {"per_100g", "per_100ml"},
    "label_ocr": {"per_100g", "per_100ml", "per_package", "per_serving", "per_piece"},
    "photo": {"as_estimated"},
    "manual": {"as_entered"},
}
_ITEM_INPUT_KEYS = ("item_id", "name", "source", "reference", "estimate_detail", "portion")


def _dec(value: float | int | str | Decimal) -> Decimal:
    # float は str を経由して Decimal にする（0.15 が 0.1499… にならないように）
    return value if isinstance(value, Decimal) else Decimal(str(value))


def round1(value: float | int | str | Decimal) -> float:
    """小数第1位で四捨五入する（ROUND_HALF_UP）。"""
    return float(_dec(value).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def record_date_of(eaten_at: str) -> str:
    """DM-01: 日本時間の eaten_at から 4時間引いた日付（YYYY-MM-DD）。"""
    return (datetime.fromisoformat(eaten_at) - DAY_BOUNDARY).date().isoformat()


def _whole(reference: Mapping[str, Any]) -> Decimal:
    btype = reference["basis"]["type"]
    net = reference.get("net_content") or {}
    if btype in ("per_100g", "per_100ml"):
        unit = "g" if btype == "per_100g" else "ml"
        if net.get("status") in ("known", "assumed_from_serving") and net.get("amount") and net.get("unit") == unit:
            return _dec(net["amount"]) / 100
        return Decimal(1)  # 内容量が分からない（または単位が合わない）ときは 100g（ml）食べたとみなす
    if btype == "per_piece":
        return Decimal(net.get("pieces") or 1)
    return Decimal(1)


def _multiplier(reference: Mapping[str, Any], portion: Mapping[str, Any]) -> Decimal:
    mode = portion["mode"]
    if mode == "whole":
        return _whole(reference)
    if mode == "fraction":
        return _whole(reference) * _dec(portion["fraction"])
    if mode == "pieces":
        return Decimal(portion["pieces"])
    raise RuleViolation(f"分量の選び方が不明: {mode}", rule="DM-06")


def whole_multiplier(reference: Mapping[str, Any]) -> float:
    """「全部」の倍率（domain-model.md §2-3）。"""
    return float(_whole(reference))


def multiplier_for(reference: Mapping[str, Any], portion: Mapping[str, Any]) -> float:
    """DM-04: 分量の選択（mode・fraction・pieces）から決まる倍率。"""
    return float(_multiplier(reference, portion))


def _check_source(item: Mapping[str, Any]) -> None:
    """DM-05: 出どころと基準の組み合わせ。"""
    src, ref = item["source"], item["reference"]
    method = src["method"]
    if method not in PROVIDER_BY_METHOD:
        raise RuleViolation(f"入力方式が不明: {method}", rule="DM-05")
    checks = [
        (src["provider"] == PROVIDER_BY_METHOD[method], f"{method} の提供元は {PROVIDER_BY_METHOD[method]}"),
        (ref["basis"]["type"] in BASIS_BY_METHOD[method], f"{method} では基準 {ref['basis']['type']} を使えない"),
        ((method == "barcode") == (src["product_code"] is not None), "product_code はバーコードのときだけ持つ"),
        (
            (src["provider"] == "claude") == (src["estimation"] is not None),
            "estimation は Claude で推定したときだけ持つ",
        ),
        (method != "photo" or src["confidence"] is not None, "写真推定は confidence を持つ"),
        ((method == "photo") == (item["estimate_detail"] is not None), "estimate_detail は写真推定のときだけ持つ"),
        (
            method == "label_ocr" or (src["column_index"] is None and src["column_heading"] is None),
            "列の番号・見出しは栄養成分表示のときだけ持つ",
        ),
        ((method in ("photo", "manual")) == (ref["net_content"] is None), "内容量は写真推定・手入力では持たない"),
    ]
    for ok, message in checks:
        if not ok:
            raise RuleViolation(message, rule="DM-05")


def _check_portion(item: Mapping[str, Any]) -> None:
    """DM-06: 分量の選び方の組み合わせ。"""
    portion, method = item["portion"], item["source"]["method"]
    mode = portion["mode"]
    checks = [
        (mode in ("whole", "fraction", "pieces"), f"分量の選び方が不明: {mode}"),
        (mode != "pieces" or item["reference"]["basis"]["type"] == "per_piece", "個数で選べるのは1個当たりの基準だけ"),
        (method != "manual" or mode == "whole", "手入力は全部だけ"),
        ((mode == "fraction") == (portion["fraction"] is not None), "fraction は割合で選んだときだけ持つ"),
        ((mode == "pieces") == (portion["pieces"] is not None), "pieces は個数で選んだときだけ持つ"),
    ]
    for ok, message in checks:
        if not ok:
            raise RuleViolation(message, rule="DM-06")


def build_item(item_input: Mapping[str, Any]) -> JsonDict:
    """食品の入力（api の FoodItemInput）から食品を作る。

    DM-05・06・09 を検証し、倍率と食べた量の値（DM-03・04）を計算する。
    """
    item = {k: copy.deepcopy(item_input[k]) for k in _ITEM_INPUT_KEYS}
    _check_source(item)
    _check_portion(item)
    ref_nutrients = item["reference"]["nutrients"]
    if item["source"]["method"] == "manual" and any(ref_nutrients[n] is None for n in NUTRIENTS):
        raise RuleViolation("手入力は kcal・P・F・C をすべて入力する", rule="DM-09")

    multiplier = _multiplier(item["reference"], item["portion"])
    portion = {k: item["portion"][k] for k in ("mode", "fraction", "pieces")}
    portion["multiplier"] = float(multiplier)
    nutrients = {
        n: None if ref_nutrients[n] is None else round1(_dec(ref_nutrients[n]) * multiplier) for n in NUTRIENTS
    }
    return {
        "item_id": item["item_id"],
        "name": item["name"],
        "source": item["source"],
        "reference": item["reference"],
        "portion": portion,
        "nutrients": nutrients,
        "estimate_detail": item["estimate_detail"],
    }


def totals_of(items: Sequence[Mapping[str, Any]]) -> tuple[JsonDict, list[str]]:
    """DM-02: 食事の合計と、null を含む栄養素（NUTRIENTS の順）。"""
    totals: JsonDict = {}
    for n in NUTRIENTS:
        total = sum((_dec(i["nutrients"][n]) for i in items if i["nutrients"][n] is not None), Decimal(0))
        totals[n] = round1(total)
    incomplete = [n for n in NUTRIENTS if any(i["nutrients"][n] is None for i in items)]
    return totals, incomplete


def _with_items(meal: Mapping[str, Any], items: list[JsonDict], *, version: int, now: str) -> JsonDict:
    if not items:
        raise RuleViolation("食事には食品が1件以上要る", rule="DM-08")
    ids = [i["item_id"] for i in items]
    if len(ids) != len(set(ids)):
        raise RuleViolation("食事の中で item_id が重複している", rule="DM-07")
    totals, incomplete = totals_of(items)
    out = copy.deepcopy(dict(meal))
    out.update(items=items, totals=totals, totals_incomplete=incomplete, version=version, updated_at=now)
    return out


def create_meal(*, meal_id: str, user_id: str, eaten_at: str, items: Sequence[Mapping[str, Any]], now: str) -> JsonDict:
    """食事を作る（version 1）。items は食品の入力。DM-01〜09 を満たさなければ RuleViolation。"""
    base = {
        "meal_id": meal_id,
        "user_id": user_id,
        "eaten_at": eaten_at,
        "record_date": record_date_of(eaten_at),
        "created_at": now,
    }
    meal = _with_items(base, [build_item(i) for i in items], version=1, now=now)
    order = (
        "meal_id",
        "user_id",
        "eaten_at",
        "record_date",
        "items",
        "totals",
        "totals_incomplete",
        "version",
        "created_at",
        "updated_at",
    )
    return {k: meal[k] for k in order}


def _check_version(meal: Mapping[str, Any], expected_version: int) -> None:
    if meal["version"] != expected_version:
        raise VersionConflict(f"expected_version {expected_version}, current {meal['version']}")


def add_item(meal: Mapping[str, Any], item_input: Mapping[str, Any], *, expected_version: int, now: str) -> JsonDict:
    """既存の食事に食品を足した新しい食事を返す（version +1、合計を計算し直す）。"""
    _check_version(meal, expected_version)
    if any(i["item_id"] == item_input["item_id"] for i in meal["items"]):
        raise ItemAlreadyExists(f"item_id {item_input['item_id']} はすでにある")
    items = [*copy.deepcopy(meal["items"]), build_item(item_input)]
    return _with_items(meal, items, version=meal["version"] + 1, now=now)


def remove_item(meal: Mapping[str, Any], item_id: str, *, expected_version: int, now: str) -> JsonDict | None:
    """食品を消した新しい食事を返す。最後の1件を消したら None（食事ごと削除、Q-31）。"""
    _check_version(meal, expected_version)
    if not any(i["item_id"] == item_id for i in meal["items"]):
        raise ItemNotFound(f"item_id {item_id} がない")
    items = [copy.deepcopy(i) for i in meal["items"] if i["item_id"] != item_id]
    if not items:
        return None
    return _with_items(meal, items, version=meal["version"] + 1, now=now)
