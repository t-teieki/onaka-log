"""PoC-1: Open Food Facts の応答を正解データと突き合わせる純粋関数群（I/O なし）。"""

from __future__ import annotations

import re
from typing import Any

NUTRIENTS = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")

# 許容誤差: max(正解の 5%, 下限)
REL_TOL = 0.05
ABS_FLOOR = {
    "energy_kcal": 5.0,
    "protein_g": 0.5,
    "fat_g": 0.5,
    "carbohydrate_g": 0.5,
}

KJ_PER_KCAL = 4.184
EPS = 1e-9

# OFF nutriments のキー（P/F/C）
_OFF_KEYS = {
    "protein_g": "proteins",
    "fat_g": "fat",
    "carbohydrate_g": "carbohydrates",
}


def _num(v: Any) -> float | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return None
    return None


def _energy_kcal(nutr: dict, suffix: str) -> tuple[float | None, bool]:
    """kcal を返す。無ければ kJ から換算（戻り値の bool が True なら kJ 換算）。"""
    kcal = _num(nutr.get(f"energy-kcal{suffix}"))
    if kcal is not None:
        return kcal, False
    kj = _num(nutr.get(f"energy-kj{suffix}"))
    if kj is None:
        kj = _num(nutr.get(f"energy{suffix}"))  # OFF の energy は kJ
    if kj is not None:
        return kj / KJ_PER_KCAL, True
    return None, False


def parse_quantity(text: Any) -> tuple[float, str] | None:
    """'150ml' や '1.5 kg' などを (値, g または ml) に。解釈できなければ None。"""
    if not isinstance(text, str):
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|cl|dl)\b", text.strip(), re.I)
    if not m:
        return None
    value = float(m.group(1).replace(",", "."))
    unit = m.group(2).lower()
    factor = {"g": 1, "kg": 1000, "ml": 1, "l": 1000, "cl": 10, "dl": 100}[unit]
    return value * factor, "g" if unit in ("g", "kg") else "ml"


def extract_off(payload: dict | None) -> dict:
    """OFF の応答から評価に必要な値を取り出す。"""
    product = (payload or {}).get("product")
    found = bool(payload) and payload.get("status") == 1 and isinstance(product, dict)
    if not found:
        return {"found": False}

    nutr = product.get("nutriments") or {}
    per100: dict[str, float | None] = {}
    serving: dict[str, float | None] = {}
    kcal100, from_kj = _energy_kcal(nutr, "_100g")
    kcal_s, _ = _energy_kcal(nutr, "_serving")
    per100["energy_kcal"] = kcal100
    serving["energy_kcal"] = kcal_s
    for key, off in _OFF_KEYS.items():
        per100[key] = _num(nutr.get(f"{off}_100g"))
        serving[key] = _num(nutr.get(f"{off}_serving"))

    # 内容量: product_quantity(+unit) を優先、無ければ quantity を解釈
    off_net = None
    pq = _num(product.get("product_quantity"))
    if pq is not None:
        unit = str(product.get("product_quantity_unit") or "").lower()
        off_net = {"value": pq, "unit": unit or None, "source": "product_quantity"}
    else:
        parsed = parse_quantity(product.get("quantity"))
        if parsed:
            off_net = {"value": parsed[0], "unit": parsed[1], "source": "quantity"}

    # 1食分の量（serving_quantity）。1個売りの商品では内容量の代わりに使える可能性がある
    sq = _num(product.get("serving_quantity"))
    off_serving = None
    if sq is not None:
        parsed = parse_quantity(product.get("serving_size"))
        off_serving = {"value": sq, "unit": parsed[1] if parsed else None}

    name = product.get("product_name_ja") or product.get("product_name") or ""
    return {
        "found": True,
        "product_name": name,
        "nutrition_data_per": product.get("nutrition_data_per") or None,
        "per100": per100,
        "serving": serving,
        "energy_from_kj": from_kj,
        "has_all4_100g": all(per100[n] is not None for n in NUTRIENTS),
        "has_all4_serving": all(serving[n] is not None for n in NUTRIENTS),
        "off_net_content": off_net,
        "off_serving": off_serving,
    }


def truth_basis_amount(truth: dict) -> float:
    """正解の基準量。per_100g / per_100ml は 100 固定。"""
    if truth["basis"] in ("per_100g", "per_100ml"):
        return 100.0
    return float(truth["basis_amount"])


def convert_basis(per100: dict, truth: dict) -> dict:
    """OFF の 100g 当たり値を正解の基準に換算する。正解の基準量を使い OFF の内容量は使わない。"""
    factor = truth_basis_amount(truth) / 100.0
    return {n: (None if per100[n] is None else per100[n] * factor) for n in NUTRIENTS}


def is_match(nutrient: str, truth_value: float, off_value: float) -> bool:
    tol = max(REL_TOL * abs(truth_value), ABS_FLOOR[nutrient])
    return abs(off_value - truth_value) <= tol + EPS


def _density_flag(truth: dict, nutrition_data_per: str | None) -> bool:
    unit = truth.get("basis_unit")
    per = nutrition_data_per or ""
    if "100g" in per:
        return unit == "ml"
    if "100ml" in per:
        return unit == "g"
    return False


def evaluate_sample(truth: dict, payload: dict | None) -> dict:
    """1サンプルの評価。truth は数値化済みの dict（CSV 1行分）。"""
    off = extract_off(payload)
    reasons: list[str] = []
    flags = {"unit_assumed_density_1": False, "energy_from_kj": False}
    result: dict[str, Any] = {
        "sample_id": truth["sample_id"],
        "jan": truth["jan"],
        "truth": {n: truth.get(n) for n in NUTRIENTS},
        "found": off["found"],
        "off_product_name": off.get("product_name"),
        "nutrition_data_per": off.get("nutrition_data_per"),
        "off_per100": off.get("per100"),
        "off_net_content": off.get("off_net_content"),
        "truth_net_content": {
            "value": truth.get("net_content"),
            "unit": truth.get("net_content_unit"),
        },
        "off_serving": off.get("off_serving"),
        "has_all4_100g": False,
        "has_net_content": False,
        "has_net_or_serving": False,
        "serving_equals_truth_net": None,
        "comparable": False,
        "converted": None,
        "nutrients": {},
        "all4_match": None,
        "flags": flags,
        "reasons": reasons,
    }
    if not off["found"]:
        reasons.append("not_found")
        return result

    result["has_net_content"] = off["off_net_content"] is not None
    if not result["has_net_content"]:
        reasons.append("off_net_content_missing")
    serving = off["off_serving"]
    result["has_net_or_serving"] = result["has_net_content"] or serving is not None
    if serving is not None and truth.get("net_content"):
        # 単位（g/ml）の違いは問わず、量が正解の内容量と 1% 以内で一致するか
        result["serving_equals_truth_net"] = (
            abs(serving["value"] - truth["net_content"]) <= 0.01 * truth["net_content"] + EPS
        )
    result["has_all4_100g"] = off["has_all4_100g"]
    flags["energy_from_kj"] = off["energy_from_kj"]
    if off["nutrition_data_per"] is None:
        reasons.append("nutrition_data_per_missing")

    if not off["has_all4_100g"]:
        if off["has_all4_serving"]:
            reasons.append("serving_only")
        else:
            reasons.append("nutrients_missing")
        flags["energy_from_kj"] = False
        return result

    flags["unit_assumed_density_1"] = _density_flag(truth, off["nutrition_data_per"])
    conv = convert_basis(off["per100"], truth)
    result["converted"] = conv
    result["comparable"] = True
    matches = []
    for n in NUTRIENTS:
        t = truth.get(n)
        if t is None:
            result["nutrients"][n] = {"diff": None, "rel_diff": None, "match": None}
            continue
        diff = conv[n] - t
        rel = diff / t if t else None
        m = is_match(n, t, conv[n])
        matches.append(m)
        result["nutrients"][n] = {"diff": diff, "rel_diff": rel, "match": m}
    result["all4_match"] = len(matches) == len(NUTRIENTS) and all(matches)
    return result


def _rate(num: int, den: int) -> float | None:
    return None if den == 0 else num / den


def aggregate(results: list[dict], min_n: int = 20) -> dict:
    """メトリクス ①〜⑤ と判定。"""
    n = len(results)
    found = [r for r in results if r["found"]]
    comparable = [r for r in results if r["comparable"]]
    per_counts: dict[str, int] = {}
    for r in found:
        k = r["nutrition_data_per"] or "missing"
        per_counts[k] = per_counts.get(k, 0) + 1
    usable = [r for r in found if r["has_all4_100g"]]
    with_net = [r for r in found if r["has_net_content"]]
    with_net_or_serving = [r for r in found if r["has_net_or_serving"]]
    serving_eq = [r for r in found if r["serving_equals_truth_net"]]
    all4m = [r for r in comparable if r["all4_match"]]
    m: dict[str, Any] = {
        "n": n,
        "found": len(found),
        "found_rate": _rate(len(found), n),
        "all4": len(usable),
        "all4_rate": _rate(len(usable), len(found)),
        "net_content": len(with_net),
        "net_content_rate": _rate(len(with_net), len(found)),
        "net_or_serving": len(with_net_or_serving),
        "net_or_serving_rate": _rate(len(with_net_or_serving), len(found)),
        "serving_equals_net": len(serving_eq),
        "per_breakdown": per_counts,
        "comparable": len(comparable),
        "nutrient_match": {},
        "all4_match": len(all4m),
        "all4_match_rate": _rate(len(all4m), len(comparable)),
        "usable": len(usable),
        "usable_rate": _rate(len(usable), n),  # ①×②（全体に対する割合）
        "energy_from_kj": sum(1 for r in found if r["flags"]["energy_from_kj"]),
    }
    for nut in NUTRIENTS:
        vals = [r["nutrients"][nut]["match"] for r in comparable if nut in r["nutrients"]]
        vals = [v for v in vals if v is not None]
        m["nutrient_match"][nut] = {"match": sum(vals), "total": len(vals), "rate": _rate(sum(vals), len(vals))}

    if n < min_n:
        m["verdict"] = "hold"
    elif m["usable_rate"] >= 0.5:
        m["verdict"] = "adopt"
    elif m["usable_rate"] < 0.2:
        m["verdict"] = "demote"
    else:
        m["verdict"] = "consult"
    return m
