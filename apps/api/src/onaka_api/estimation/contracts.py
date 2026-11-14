"""contracts/llm のスキーマを読み、Claude の出力を検証する（F-012-01・F-013-01）。"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


def contracts_dir() -> Path:
    """contracts/ の場所。環境変数 ONAKA_CONTRACTS_DIR があればそれ、なければリポジトリの contracts/。"""
    env = os.environ.get("ONAKA_CONTRACTS_DIR")
    if env:
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "contracts"
        if (candidate / "llm").is_dir():
            return candidate
    raise FileNotFoundError("contracts/ が見つからない（ONAKA_CONTRACTS_DIR を設定する）")


@lru_cache(maxsize=8)
def _validator(usecase: str) -> Draft202012Validator:
    path = contracts_dir() / "llm" / usecase / "output.schema.json"
    schema = json.loads(path.read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def _ocr_semantic(output: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    cols = output["columns"]
    if output["status"] == "ok":
        if not cols:
            errors.append("ok なのに columns が空")
        errors += [
            f"columns[{i}] の energy_kcal が null" for i, c in enumerate(cols) if c["nutrients"]["energy_kcal"] is None
        ]
    elif cols:
        errors.append("ok 以外なのに columns が空でない")
    if len(cols) > 1 and "multiple_labels" not in output["issues"]:
        errors.append("列が複数なのに issues に multiple_labels がない")
    for i, c in enumerate(cols):
        basis = c["basis"]
        if basis["type"] == "per_piece" and (basis["amount"] is not None or basis["unit"] is not None):
            errors.append(f"columns[{i}] は per_piece なのに amount / unit が null でない")
    return errors


def _photo_semantic(output: Mapping[str, Any]) -> list[str]:
    if output["status"] == "ok":
        return [] if output["items"] else ["ok なのに items が空"]
    errors = []
    if output["items"]:
        errors.append("ok 以外なのに items が空でない")
    if output["meal_name"] is not None:
        errors.append("ok 以外なのに meal_name が null でない")
    return errors


_SEMANTIC = {"nutrition-label-ocr": _ocr_semantic, "food-photo-estimate": _photo_semantic}


def output_errors(usecase: str, output: Mapping[str, Any]) -> list[str]:
    """出力スキーマ（完全版）と意味上のルールの違反を返す。空なら適合。"""
    schema_errors = [
        f"{'/'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}"
        for e in _validator(usecase).iter_errors(output)
    ]
    if schema_errors:
        return schema_errors  # 形が違うと意味上のルールは調べられない
    return _SEMANTIC[usecase](output)
