"""ドメインのルール DM-01〜DM-08（docs/02_design/domain-model.md §6）の参照実装。

JSON Schema で表せないルールを、契約テストで例ファイルに当てるためのもの。
バックエンドの実装でも同じルールを検証する（実装時にこの関数と同じ結果になることをテストする）。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

NUTRIENTS = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")
DAY_BOUNDARY = timedelta(hours=4)

BASIS_BY_METHOD = {
    "barcode": {"per_100g", "per_100ml"},
    "label_ocr": {"per_100g", "per_100ml", "per_package", "per_serving", "per_piece"},
    "photo": {"as_estimated"},
    "manual": {"as_entered"},
}
PROVIDER_BY_METHOD = {
    "barcode": "open_food_facts",
    "label_ocr": "claude",
    "photo": "claude",
    "manual": "user",
}


def round1(value) -> float:
    """小数第1位で四捨五入（ROUND_HALF_UP）。"""
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def record_date_of(eaten_at: str) -> str:
    """DM-01: 日本時間の eaten_at から 4時間引いた日付。"""
    return (datetime.fromisoformat(eaten_at) - DAY_BOUNDARY).date().isoformat()


def whole_multiplier(reference: dict) -> float:
    """「全部」の倍率（domain-model.md §2-3）。"""
    basis = reference["basis"]
    net = reference.get("net_content") or {}
    btype = basis["type"]
    if btype in ("per_100g", "per_100ml"):
        unit = "g" if btype == "per_100g" else "ml"
        if net.get("status") in ("known", "assumed_from_serving") and net.get("amount") and net.get("unit") == unit:
            return net["amount"] / 100
        return 1.0
    if btype == "per_piece":
        return float(net.get("pieces") or 1)
    return 1.0


def expected_multiplier(reference: dict, portion: dict) -> float:
    """DM-04: 分量の選択から決まる倍率。"""
    mode = portion["mode"]
    if mode == "whole":
        return whole_multiplier(reference)
    if mode == "fraction":
        return whole_multiplier(reference) * portion["fraction"]
    if mode == "pieces":
        return float(portion["pieces"])
    raise ValueError(mode)


def eaten_nutrients(reference: dict, multiplier: float) -> dict:
    """DM-03: 食べた量の値。"""
    return {
        n: None if reference["nutrients"][n] is None else round1(reference["nutrients"][n] * multiplier)
        for n in NUTRIENTS
    }


def totals_of(items: list[dict]) -> tuple[dict, list[str]]:
    """DM-02: 食事の合計と、null を含む栄養素。"""
    totals = {n: round1(sum(i["nutrients"][n] or 0 for i in items)) for n in NUTRIENTS}
    incomplete = [n for n in NUTRIENTS if any(i["nutrients"][n] is None for i in items)]
    return totals, incomplete


def _close(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) < 1e-9


def item_errors(item: dict) -> list[str]:
    errors: list[str] = []
    src, ref, portion = item["source"], item["reference"], item["portion"]
    method = src["method"]
    btype = ref["basis"]["type"]

    # DM-05: 出どころの組み合わせ
    if src["provider"] != PROVIDER_BY_METHOD[method]:
        errors.append(f"DM-05: {method} の provider は {PROVIDER_BY_METHOD[method]}")
    if btype not in BASIS_BY_METHOD[method]:
        errors.append(f"DM-05: {method} では基準 {btype} を使えない")
    if (method == "barcode") != (src["product_code"] is not None):
        errors.append("DM-05: product_code は barcode のときだけ持つ")
    if (src["provider"] == "claude") != (src["estimation"] is not None):
        errors.append("DM-05: estimation は Claude で推定したときだけ持つ")
    if method == "photo" and src["confidence"] is None:
        errors.append("DM-05: photo は confidence を持つ")
    if (method == "photo") != (item["estimate_detail"] is not None):
        errors.append("DM-05: estimate_detail は photo のときだけ持つ")
    if method != "label_ocr" and (src["column_index"] is not None or src["column_heading"] is not None):
        errors.append("DM-05: column_index / column_heading は label_ocr のときだけ持つ")
    if (method in ("photo", "manual")) != (ref["net_content"] is None):
        errors.append("DM-05: net_content は photo・manual では null、それ以外では必須")

    # DM-06: 分量の選択
    mode = portion["mode"]
    if mode == "pieces" and btype != "per_piece":
        errors.append("DM-06: pieces は基準が per_piece のときだけ")
    if method == "manual" and mode != "whole":
        errors.append("DM-06: manual は whole だけ")
    if (mode == "fraction") != (portion["fraction"] is not None):
        errors.append("DM-06: fraction は mode が fraction のときだけ持つ")
    if (mode == "pieces") != (portion["pieces"] is not None):
        errors.append("DM-06: pieces は mode が pieces のときだけ持つ")

    # DM-04・DM-03: 倍率と食べた量の値
    try:
        mult = expected_multiplier(ref, portion)
    except (KeyError, TypeError, ValueError):
        return errors + ["DM-04: 倍率を計算できない"]
    if not _close(portion["multiplier"], mult):
        errors.append(f"DM-04: multiplier は {mult}（実際 {portion['multiplier']}）")
    expected = eaten_nutrients(ref, portion["multiplier"])
    for n in NUTRIENTS:
        if not _close(item["nutrients"][n], expected[n]):
            errors.append(f"DM-03: nutrients.{n} は {expected[n]}（実際 {item['nutrients'][n]}）")
    return errors


def meal_errors(meal: dict) -> list[str]:
    """食事1件のルール違反を返す（空なら適合）。"""
    errors: list[str] = []
    items = meal["items"]
    if not items:
        errors.append("DM-08: 食品が0件")
    if record_date_of(meal["eaten_at"]) != meal["record_date"]:
        errors.append(f"DM-01: record_date は {record_date_of(meal['eaten_at'])}")
    ids = [i["item_id"] for i in items]
    if len(ids) != len(set(ids)):
        errors.append("DM-07: item_id が重複している")
    for k, item in enumerate(items):
        errors += [f"items[{k}] {e}" for e in item_errors(item)]
    totals, incomplete = totals_of(items)
    for n in NUTRIENTS:
        if not _close(meal["totals"][n], totals[n]):
            errors.append(f"DM-02: totals.{n} は {totals[n]}（実際 {meal['totals'][n]}）")
    if meal["totals_incomplete"] != incomplete:
        errors.append(f"DM-02: totals_incomplete は {incomplete}")
    return errors
