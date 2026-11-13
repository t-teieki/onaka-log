"""PoC-3: 料理写真の推定結果を、正解データなしで評価する純粋関数群（I/O なし）。

正解データは用意しない（本番でも正解はなく、推定値をそのまま登録する。2026-11-13 ユーザー判断）。
そのため次の「正解がなくても測れること」だけを見る。
- 形式: スキーマ適合・意味上のルール（status が ok 以外なら items は空、meal_name は null）
- 内部の整合: 品目ごとに kcal ≈ 4P + 9F + 4C（アトウォーター係数）
- 再現性: 同じ写真を複数回推定したときの合計値の変動係数（CV）
- モデル間の差: 設定ごとの平均 kcal と、全設定の中央値との差
"""

from __future__ import annotations

import statistics
from typing import Any

from jsonschema import Draft202012Validator

NUTRIENTS = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")
ATWATER_TOL = 0.15        # kcal と 4P+9F+4C のずれの許容（±15%）
ATWATER_MIN_KCAL = 30.0   # これ未満の品目（お茶・スープの具など）は比が不安定なので対象外
CV_TARGET = 0.10          # poc/README.md PoC-3 の合格の目安（3回推定の変動係数 10% 以内）


def validate_output(pred: dict, schema: dict) -> list[str]:
    validator = Draft202012Validator(schema)
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}"
        for e in validator.iter_errors(pred)
    ]


def semantic_errors(pred: dict) -> list[str]:
    """contracts/llm/README.md の意味上のルール（写真・テキスト）。"""
    try:
        if pred["status"] != "ok":
            errors = []
            if pred["items"]:
                errors.append("status が ok 以外なのに items が空でない")
            if pred["meal_name"] is not None:
                errors.append("status が ok 以外なのに meal_name が null でない")
            return errors
        return [] if pred["items"] else ["status が ok なのに items が空"]
    except (KeyError, TypeError):
        return ["出力の形がスキーマと違う"]


def totals(pred: dict | None) -> dict[str, float] | None:
    """品目の合計（アプリ側の計算と同じ。Claude には合計を出させない）。ok 以外・出力なしは None。"""
    if not pred or pred.get("status") != "ok":
        return None
    out = {n: 0.0 for n in NUTRIENTS}
    for item in pred.get("items") or []:
        for n in NUTRIENTS:
            out[n] += float((item.get("nutrients") or {}).get(n) or 0)
    return out


def atwater_ratio(nutrients: dict) -> float | None:
    """(4P + 9F + 4C) / kcal。kcal が小さい品目は None（対象外）。"""
    kcal = float(nutrients.get("energy_kcal") or 0)
    if kcal < ATWATER_MIN_KCAL:
        return None
    calc = 4 * float(nutrients.get("protein_g") or 0) + 9 * float(nutrients.get("fat_g") or 0) \
        + 4 * float(nutrients.get("carbohydrate_g") or 0)
    return calc / kcal


def atwater_checks(pred: dict | None) -> list[bool]:
    """品目ごとに、アトウォーター比が ±15% 以内か。対象外の品目は含めない。"""
    if not pred or pred.get("status") != "ok":
        return []
    out = []
    for item in pred.get("items") or []:
        r = atwater_ratio(item.get("nutrients") or {})
        if r is not None:
            out.append(abs(r - 1) <= ATWATER_TOL)
    return out


def cv(values: list[float]) -> float | None:
    """変動係数（標本標準偏差 / 平均）。2件未満・平均 0 なら None。"""
    if len(values) < 2:
        return None
    mean = statistics.fmean(values)
    if mean == 0:
        return None
    return statistics.stdev(values) / mean


def item_names(pred: dict | None) -> list[str]:
    if not pred or pred.get("status") != "ok":
        return []
    return [str(i.get("name")) for i in pred.get("items") or []]


def rel_diff(value: float | None, ref: float | None) -> float | None:
    """(value - ref) / ref。どちらかが None、ref が 0 なら None。"""
    if value is None or ref is None or ref == 0:
        return None
    return (value - ref) / ref
