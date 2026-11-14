"""推定・照合の結果から、保存用の食品の候補（FoodItemDraft）を作る（F-011・F-012・F-013）。

外部（HTTP・Claude）は呼ばない。受け取った応答を変換するだけの純粋なコード。
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from onaka_api.domain import round1
from onaka_api.estimation.contracts import output_errors
from onaka_api.estimation.errors import EstimationFailed

JsonDict = dict[str, Any]

NUTRIENTS = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")
UNKNOWN_FOOD_NAME = "名称不明の食品"
UNKNOWN_PRODUCT_NAME = "名称不明の商品"
KJ_PER_KCAL = Decimal("4.184")
_WHOLE: JsonDict = {"mode": "whole", "fraction": None, "pieces": None}


def default_portion(reference: Mapping[str, Any]) -> JsonDict:
    """分量の既定（F-011-08・F-012-07・F-013-07）。1個当たりで2個以上入りなら1個、それ以外は全部。"""
    net = reference.get("net_content") or {}
    if reference["basis"]["type"] == "per_piece" and (net.get("pieces") or 0) >= 2:
        return {"mode": "pieces", "fraction": None, "pieces": 1}
    return dict(_WHOLE)


def _source(method: str, provider: str, **kw: Any) -> JsonDict:
    src: JsonDict = {
        "method": method,
        "provider": provider,
        "product_code": None,
        "estimation": None,
        "confidence": None,
        "column_index": None,
        "column_heading": None,
    }
    src.update(kw)
    return src


def _four(nutrients: Mapping[str, Any]) -> JsonDict:
    return {n: nutrients.get(n) for n in NUTRIENTS}


def _check(usecase: str, output: Mapping[str, Any]) -> None:
    errors = output_errors(usecase, output)
    if errors:
        # 出力の中身（読み取った値など）はメッセージに入れない。件数と最初の違反の場所だけ
        raise EstimationFailed(f"{usecase} の出力が契約に合わない（{len(errors)}件）: {errors[0][:200]}")


# ---- F-012 栄養成分表示 ----


def label_response(output: Mapping[str, Any], *, estimation: Mapping[str, str]) -> JsonDict:
    """Claude の栄養成分表示の出力（v0.3）を検証し、LabelEstimateResponse に変換する（F-012）。"""
    _check("nutrition-label-ocr", output)
    columns = output["columns"] if output["status"] == "ok" else []
    multiple = len(columns) > 1
    net = output["net_content"]
    known = net["amount"] is not None or net["pieces"] is not None
    net_content = {
        "status": "known" if known else "unknown",
        "amount": net["amount"] if known else None,
        "unit": net["unit"] if known else None,
        "pieces": net["pieces"] if known else None,
    }
    base_name = output["product_name"] or UNKNOWN_FOOD_NAME
    candidates = []
    for i, col in enumerate(columns):
        heading = col["heading"]
        basis = col["basis"]
        reference = {
            "basis": {
                "type": basis["type"],
                "amount": basis["amount"],
                "unit": basis["unit"],
                "label": basis["label_text"],
            },
            "net_content": dict(net_content),
            "nutrients": _four(col["nutrients"]),
        }
        candidates.append(
            {
                "name": f"{base_name}（{heading}）" if heading else base_name,
                "source": _source(
                    "label_ocr",
                    "claude",
                    estimation=dict(estimation),
                    confidence=output["confidence"],
                    column_index=i if multiple else None,
                    column_heading=heading if multiple else None,
                ),
                "reference": reference,
                "estimate_detail": None,
                "default_portion": default_portion(reference),
            }
        )
    return {
        "status": output["status"],
        "product_name": output["product_name"],
        "candidates": candidates,
        "issues": list(output["issues"]),
        "notes": output["notes"],
    }


# ---- F-013 写真推定 ----


def photo_response(output: Mapping[str, Any], *, estimation: Mapping[str, str]) -> JsonDict:
    """Claude の写真推定の出力を検証し、PhotoEstimateResponse に変換する（F-013）。"""
    _check("food-photo-estimate", output)
    items = []
    for item in output["items"] if output["status"] == "ok" else []:
        reference = {
            "basis": {"type": "as_estimated", "amount": None, "unit": None, "label": None},
            "net_content": None,
            "nutrients": _four(item["nutrients"]),
        }
        items.append(
            {
                "name": item["name"],
                "source": _source("photo", "claude", estimation=dict(estimation), confidence=item["confidence"]),
                "reference": reference,
                "estimate_detail": {
                    "amount_value": item["amount"]["value"],
                    "amount_unit": item["amount"]["unit"],
                    "estimated_weight_g": item["estimated_weight_g"],
                },
                "default_portion": default_portion(reference),
            }
        )
    return {
        "status": output["status"],
        "meal_name": output["meal_name"],
        "items": items,
        "assumptions": list(output["assumptions"]),
        "notes": output["notes"],
    }


# ---- F-011 バーコード（Open Food Facts） ----


def _num(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        try:
            return Decimal(value.strip().replace(",", "."))
        except ArithmeticError:
            return None
    return None


_UNIT_FACTOR: dict[str, tuple[Decimal, str]] = {
    "g": (Decimal(1), "g"),
    "kg": (Decimal(1000), "g"),
    "mg": (Decimal("0.001"), "g"),
    "ml": (Decimal(1), "ml"),
    "l": (Decimal(1000), "ml"),
    "cl": (Decimal(10), "ml"),
    "dl": (Decimal(100), "ml"),
}


def _quantity(value: Any, unit: Any) -> tuple[Decimal, str] | None:
    """数値と単位（kg・L なども可）を g / ml に直す。"""
    amount = _num(value)
    u = str(unit or "").strip().lower()
    if amount is None or amount <= 0 or u not in _UNIT_FACTOR:
        return None
    factor, base = _UNIT_FACTOR[u]
    return amount * factor, base


def _parse_quantity_text(text: Any) -> tuple[Decimal, str] | None:
    """'78 g'・'1.5 L'・'1袋（60g）' などから量と単位を読む。"""
    if not isinstance(text, str):
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(kg|mg|g|ml|cl|dl|l)\b", text, re.IGNORECASE)
    return _quantity(m.group(1), m.group(2)) if m else None


def _plain(value: Decimal) -> float | int:
    return int(value) if value == value.to_integral_value() else float(value)


def _energy_kcal(nutriments: Mapping[str, Any]) -> float | None:
    kcal = _num(nutriments.get("energy-kcal_100g"))
    if kcal is not None:
        return _plain(kcal)
    kj = _num(nutriments.get("energy-kj_100g"))
    if kj is None:
        kj = _num(nutriments.get("energy_100g"))  # OFF の energy は kJ
    return None if kj is None else round1(kj / KJ_PER_KCAL)


def product_response(product_code: str, payload: Mapping[str, Any] | None) -> JsonDict:
    """Open Food Facts の応答（見つからなければ None）を ProductLookupResponse に変換する（F-011）。"""
    not_found: JsonDict = {"status": "not_found", "item": None}
    if not payload or payload.get("status") != 1 or not isinstance(payload.get("product"), Mapping):
        return not_found
    product = payload["product"]
    nutriments = product.get("nutriments") or {}
    energy = _energy_kcal(nutriments)
    if energy is None:
        return not_found

    net = _quantity(product.get("product_quantity"), product.get("product_quantity_unit"))
    status = "known"
    if net is None:
        net = _parse_quantity_text(product.get("quantity"))
    if net is None:
        serving = _num(product.get("serving_quantity"))
        if serving is not None and serving > 0:
            parsed = _parse_quantity_text(product.get("serving_size"))
            net = (serving, parsed[1] if parsed else "g")
            status = "assumed_from_serving"
    unit = net[1] if net else "g"
    net_content = (
        {"status": status, "amount": _plain(net[0]), "unit": net[1], "pieces": None}
        if net
        else {"status": "unknown", "amount": None, "unit": None, "pieces": None}
    )
    nutrients: JsonDict = {"energy_kcal": energy}
    for key, off_key in (
        ("protein_g", "proteins_100g"),
        ("fat_g", "fat_100g"),
        ("carbohydrate_g", "carbohydrates_100g"),
    ):
        v = _num(nutriments.get(off_key))
        nutrients[key] = None if v is None else _plain(v)
    reference = {
        "basis": {"type": "per_100ml" if unit == "ml" else "per_100g", "amount": 100, "unit": unit, "label": None},
        "net_content": net_content,
        "nutrients": nutrients,
    }
    name = (product.get("product_name_ja") or product.get("product_name") or "").strip() or UNKNOWN_PRODUCT_NAME
    return {
        "status": "found",
        "item": {
            "name": name,
            "source": _source("barcode", "open_food_facts", product_code=product_code),
            "reference": reference,
            "estimate_detail": None,
            "default_portion": dict(_WHOLE),
        },
    }
