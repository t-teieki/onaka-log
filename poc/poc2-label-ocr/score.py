"""PoC-2: Claude の出力 1 件を正解 CSV の 1 行と突き合わせる純粋関数群（I/O なし）。

正解 CSV の数値列は float または None に変換済みである前提（run.py の read_truth）。
正解の expected_status が ok 以外のときは、数値・基準量・内容量の採点は対象外（None）。

出力スキーマ v0.3 では値が列（columns）ごとに返る。複数列のときは、利用者が正しい列を
選ぶ想定（Q-26）なので、正解に最も合う列を採点に使う。v0.2 の出力（basis・nutrients が
トップレベル）も1列として読めるようにしてある（過去の results.jsonl の集計用）。
"""

from __future__ import annotations

from typing import Any

from jsonschema import Draft202012Validator

NUTRIENTS = ("energy_kcal", "protein_g", "fat_g", "carbohydrate_g")
TOL = 0.05

# 1包装・1食・1個当たりの表記の違いは区別しない（正解・予測ともこのグループ内なら一致とみなす）
PACKAGE_EQUIVALENT = {"per_package", "per_serving", "per_piece"}


def close(pred: Any, truth: Any, tol: float = TOL) -> bool:
    """両方とも数値で、差が tol 以内なら True。どちらかが None なら False。"""
    if pred is None or truth is None or isinstance(pred, bool):
        return False
    try:
        return abs(float(pred) - float(truth)) <= tol + 1e-9
    except (TypeError, ValueError):
        return False


def same_or_both_null(pred: Any, truth: Any) -> bool:
    if pred is None and truth is None:
        return True
    return close(pred, truth)


def basis_type_ok(pred_type: str | None, truth_type: str) -> bool:
    if truth_type in PACKAGE_EQUIVALENT:
        return pred_type in PACKAGE_EQUIVALENT
    return pred_type == truth_type


def columns_of(pred: dict) -> list[dict]:
    """v0.3 の columns を返す。v0.2 の出力（トップレベルに basis・nutrients）は1列として扱う。"""
    if not isinstance(pred, dict):
        return []
    cols = pred.get("columns")
    if isinstance(cols, list):
        return [c for c in cols if isinstance(c, dict)]
    if "basis" in pred or "nutrients" in pred:
        return [{"heading": None, "basis": pred.get("basis"), "nutrients": pred.get("nutrients")}]
    return []


def choose_column(pred: dict, truth: dict) -> tuple[int | None, dict | None]:
    """正解に最も合う列（4項目の一致数が多い順、同数ならエネルギーの差が小さい順）。列がなければ (None, None)。"""
    cols = columns_of(pred)
    if not cols:
        return None, None

    def key(item):
        _, c = item
        n = c.get("nutrients") or {}
        hits = sum(close(n.get(k), truth.get(k)) for k in NUTRIENTS)
        try:
            diff = abs(float(n.get("energy_kcal")) - float(truth.get("energy_kcal")))
        except (TypeError, ValueError):
            diff = float("inf")
        return (-hits, diff)

    return min(enumerate(cols), key=key)


def validate_output(pred: dict, schema: dict) -> list[str]:
    """完全版スキーマで検証し、エラーメッセージのリストを返す（空なら適合）。"""
    validator = Draft202012Validator(schema)
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}"
        for e in validator.iter_errors(pred)
    ]


def semantic_errors(pred: dict) -> list[str]:
    """contracts/llm/README.md の意味上のルール（OCR、v0.3）の違反を返す。
    tests/contract/conftest.py の semantic_errors と同じルール。"""
    try:
        cols = pred["columns"]
        errors = []
        if pred["status"] == "ok":
            if not cols:
                errors.append("ok なのに columns が空")
            errors += [f"columns[{i}] energy_kcal が null" for i, c in enumerate(cols)
                       if c["nutrients"]["energy_kcal"] is None]
        elif cols:
            errors.append("ok 以外なのに columns が空でない")
        if len(cols) > 1 and "multiple_labels" not in pred["issues"]:
            errors.append("複数列なのに multiple_labels がない")
        errors += [f"columns[{i}] per_piece なのに amount/unit が null でない" for i, c in enumerate(cols)
                   if c["basis"]["type"] == "per_piece"
                   and (c["basis"]["amount"] is not None or c["basis"]["unit"] is not None)]
        return errors
    except (KeyError, TypeError, AttributeError):
        return ["出力の形が v0.3 ではない"]


def semantic_ok(pred: dict) -> bool:
    return not semantic_errors(pred)


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
    col_index, col = choose_column(pred, truth)
    col = col or {}
    s: dict[str, Any] = {
        "status_ok": _get(pred, "status") == truth.get("expected_status"),
        "pred_status": _get(pred, "status"),
        "semantic_ok": semantic_ok(pred),
        "schema_errors": validate_output(pred, schema) if schema is not None else None,
        "n_columns": len(columns_of(pred)),
        "column_index": col_index,
    }
    s["schema_valid"] = None if schema is None else not s["schema_errors"]

    nutrient_ok: dict[str, bool | None] = {}
    for n in NUTRIENTS:
        nutrient_ok[n] = close(_get(col, "nutrients", n), truth.get(n)) if expects_ok else None
    s["nutrients"] = nutrient_ok

    pred_type = _get(col, "basis", "type")
    s["pred_basis_type"] = pred_type
    if expects_ok:
        s["basis_correct"] = (
            same_or_both_null(_get(col, "basis", "amount"), truth.get("basis_amount"))
            and _get(col, "basis", "unit") == (truth.get("basis_unit") or None)
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
        "n_columns": 0,
        "column_index": None,
        "nutrients": {n: (False if expects_ok else None) for n in NUTRIENTS},
        "pred_basis_type": None,
        "basis_correct": False if expects_ok else None,
        "net_content_correct": (False if truth.get("net_content") is not None else None) if expects_ok else None,
        "all4_correct": False if expects_ok else None,
    }
