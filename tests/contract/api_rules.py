"""API のルール（docs/02_design/api.md §3〜§4）の参照実装。

スキーマで表せない、推定 API の候補と保存 API の入力に関するルールを、契約テストで例ファイルに当てる。
保存時の計算（倍率・食べた量の値・合計）は domain_rules を使う。
"""

from __future__ import annotations

import domain_rules as dr


def default_portion(reference: dict) -> dict:
    """§3-2: 分量の既定。per_piece で個数が2以上なら1個、それ以外は全部。"""
    net = reference.get("net_content") or {}
    if reference["basis"]["type"] == "per_piece" and (net.get("pieces") or 0) >= 2:
        return {"mode": "pieces", "fraction": None, "pieces": 1}
    return {"mode": "whole", "fraction": None, "pieces": None}


def build_item(item_input: dict) -> dict:
    """保存 API が食品の入力から食品を作る（倍率と食べた量の値をバックエンドで計算する）。"""
    portion = dict(item_input["portion"])
    portion["multiplier"] = round(dr.expected_multiplier(item_input["reference"], portion), 6)
    return {
        "item_id": item_input["item_id"],
        "name": item_input["name"],
        "source": item_input["source"],
        "reference": item_input["reference"],
        "portion": portion,
        "nutrients": dr.eaten_nutrients(item_input["reference"], portion["multiplier"]),
        "estimate_detail": item_input["estimate_detail"],
    }


def build_meal(request: dict, user_id: str, now_utc: str) -> dict:
    """保存 API が MealCreateRequest から食事を作る。"""
    items = [build_item(i) for i in request["items"]]
    totals, incomplete = dr.totals_of(items)
    return {
        "meal_id": request["meal_id"], "user_id": user_id, "eaten_at": request["eaten_at"],
        "record_date": dr.record_date_of(request["eaten_at"]), "items": items, "totals": totals,
        "totals_incomplete": incomplete, "version": 1, "created_at": now_utc, "updated_at": now_utc,
    }


def draft_errors(draft: dict) -> list[str]:
    """候補1件のルール違反（出どころの組み合わせ DM-05 と、分量の既定 §3-2）。"""
    probe = {"item_id": "x", **{k: draft[k] for k in ("name", "source", "reference", "estimate_detail")},
             "portion": {**draft["default_portion"], "multiplier": 0}}
    probe["portion"]["multiplier"] = dr.expected_multiplier(probe["reference"], probe["portion"])
    probe["nutrients"] = dr.eaten_nutrients(probe["reference"], probe["portion"]["multiplier"])
    errors = [e for e in dr.item_errors(probe) if not e.startswith(("DM-03", "DM-04"))]
    if draft["default_portion"] != default_portion(draft["reference"]):
        errors.append(f"API-3-2: default_portion は {default_portion(draft['reference'])}")
    return errors


def estimate_errors(kind: str, response: dict) -> list[str]:
    """推定・照合 API の応答のルール違反（§4）。kind は label / photo / product。"""
    errors: list[str] = []
    if kind == "product":
        drafts = [] if response["item"] is None else [response["item"]]
        if (response["status"] == "found") != bool(drafts):
            errors.append("API-4: found なら item あり、not_found なら null")
    else:
        drafts = response["candidates"] if kind == "label" else response["items"]
        if (response["status"] == "ok") != bool(drafts):
            errors.append("API-4: ok なら候補1件以上、それ以外は空")
        if kind == "label" and len(drafts) > 1 and "multiple_labels" not in response["issues"]:
            errors.append("API-4: 候補が複数なら issues に multiple_labels")
    method = {"label": "label_ocr", "photo": "photo", "product": "barcode"}[kind]
    for k, d in enumerate(drafts):
        if d["source"]["method"] != method:
            errors.append(f"候補[{k}]: method は {method}")
        errors += [f"候補[{k}] {e}" for e in draft_errors(d)]
    return errors


def day_errors(day: dict) -> list[str]:
    """DaySummary のルール違反: 各食事がドメインのルールを満たし、日次合計が食事の合計の和。"""
    errors: list[str] = []
    for k, m in enumerate(day["meals"]):
        errors += [f"meals[{k}] {e}" for e in dr.meal_errors(m)]
        if m["record_date"] != day["record_date"]:
            errors.append(f"meals[{k}]: record_date が違う")
    times = [m["eaten_at"] for m in day["meals"]]
    if times != sorted(times):
        errors.append("meals が時刻順でない")
    for n in dr.NUTRIENTS:
        expected = dr.round1(sum(m["totals"][n] for m in day["meals"]))
        if abs(day["totals"][n] - expected) > 1e-9:
            errors.append(f"totals.{n} は {expected}")
    incomplete = [n for n in dr.NUTRIENTS if any(n in m["totals_incomplete"] for m in day["meals"])]
    if day["totals_incomplete"] != incomplete:
        errors.append(f"totals_incomplete は {incomplete}")
    return errors
