"""PoC-2: Claude の出力 1 件を正解 CSV の 1 行と突き合わせる純粋関数群（I/O なし）。

正解 CSV の数値列は float または None に変換済みである前提（run.py の read_truth）。
正解の expected_status が ok 以外のときは、数値・基準量・内容量の採点は対象外（None）。
"""

from __future__ import annotations

from typing import Any

from jsonschema import Draft202012Validator

NUTRIENTS = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")
TOL = 0.05

# 正解が per_package のとき、これらの type を正解とみなす
PACKAGE_EQUIVALENT = {"per_package", "per_serving", "per_piece"}


def close(pred: Any, truth: Any, tol: float = TOL) -> bool:
    """両方とも数値で、差が tol 以内なら True。どちらかが None なら False。"""
    if pred is None or truth is None or isinstance(pred, bool):
        return False
    try:
        return abs(float(pred) - float(truth)) <= tol + 1e-9
    except (TypeError, ValueError):
        return False


def basis_type_ok(pred_type: str | None, truth_type: str) -> bool:
    if truth_type == "per_package":
        return pred_type in PACKAGE_EQUIVALENT
    return pred_type == truth_type


def validate_output(pred: dict, schema: dict) -> list[str]:
    """完全版スキーマで検証し、エラーメッセージのリストを返す（空なら適合）。"""
    validator = Draft202012Validator(schema)
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}"
        for e in validator.iter_errors(pred)
    ]


def semantic_ok(pred: dict) -> bool:
    """contracts/llm/README.md の意味上のルール: status ok なら energy_kcal 非 null かつ basis.type != unknown。"""
    try:
        if pred.get("status") != "ok":
            return True
        return (
            pred["nutrients"]["energy_kcal"] is not None
            and pred["basis"]["type"] != "unknown"
        )
    except (KeyError, TypeError, AttributeError):
        return False


def _get(pred: dict, *path: str) -> Any:
    cur: Any = pred
    for p in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
    return cur


def score_one(pred: dict, truth: dict, schema: dict | None = None) -> dict:
    """pred（パース済み出力）を truth（CSV 1 行）で採点する。
    採点対象外の項目は None。"""
    expects_ok = truth.get("expected_status") == "ok"
    s: dict[str, Any] = {
        "status_ok": _get(pred, "status") == truth.get("expected_status"),
        "pred_status": _get(pred, "status"),
        "semantic_ok": semantic_ok(pred),
        "schema_errors": validate_output(pred, schema) if schema is not None else None,
    }
    s["schema_valid"] = None if schema is None else not s["schema_errors"]

    nutrient_ok: dict[str, bool | None] = {}
    for n in NUTRIENTS:
        nutrient_ok[n] = close(_get(pred, "nutrients", n), truth.get(n)) if expects_ok else None
    s["nutrients"] = nutrient_ok

    pred_type = _get(pred, "basis", "type")
    s["pred_basis_type"] = pred_type
    if expects_ok:
        s["basis_correct"] = (
            close(_get(pred, "basis", "amount"), truth.get("basis_amount"))
            and _get(pred, "basis", "unit") == truth.get("basis_unit")
            and basis_type_ok(pred_type, truth.get("basis", ""))
        )
        s["net_content_correct"] = (
            close(_get(pred, "net_content", "amount"), truth.get("net_content"))
            and _get(pred, "net_content", "unit") == truth.get("net_content_unit")
            if truth.get("net_content") is not None
            else None
        )
        s["all4_correct"] = all(nutrient_ok[n] for n in NUTRIENTS)
    else:
        s["basis_correct"] = None
        s["net_content_correct"] = None
        s["all4_correct"] = None
    return s


def score_error(truth: dict) -> dict:
    """API エラー・refusal・max_tokens など出力が得られなかった場合: 採点対象の項目はすべて不正解。"""
    expects_ok = truth.get("expected_status") == "ok"
    return {
        "status_ok": False,
        "pred_status": None,
        "semantic_ok": False,
        "schema_errors": None,
        "schema_valid": False,
        "nutrients": {n: (False if expects_ok else None) for n in NUTRIENTS},
        "pred_basis_type": None,
        "basis_correct": False if expects_ok else None,
        "net_content_correct": (False if truth.get("net_content") is not None else None) if expects_ok else None,
        "all4_correct": False if expects_ok else None,
    }
