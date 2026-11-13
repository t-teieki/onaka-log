"""スキーマとシステムプロンプトの読み込み。純粋関数中心。"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
LLM_DIR = ROOT / "contracts" / "llm"

# Structured Outputs（API）が受け付けないキーワード
UNSUPPORTED_KEYWORDS = frozenset({"minimum", "maximum", "minLength", "maxLength"})
# 値がスキーマではなく「名前 → スキーマ」の辞書であるキーワード
_NAME_MAPS = ("properties", "$defs")
# 値がデータ（再帰しない）のキーワード
_DATA_KEYS = ("enum", "const", "required")


def load_schema(usecase: str) -> dict:
    path = LLM_DIR / usecase / "output.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))


def strip_unsupported(node: Any) -> Any:
    """API 非対応のキーワードを再帰的に取り除いた複製を返す。
    properties / $defs の子キーは「名前」なので、minimum という名前のプロパティは残す。"""
    if isinstance(node, list):
        return [strip_unsupported(v) for v in node]
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key in UNSUPPORTED_KEYWORDS:
            continue
        if key in _NAME_MAPS and isinstance(value, dict):
            out[key] = {name: strip_unsupported(sub) for name, sub in value.items()}
        elif key in _DATA_KEYS:
            out[key] = json.loads(json.dumps(value))
        else:
            out[key] = strip_unsupported(value)
    return out


def extract_system_prompt(md: str) -> str:
    m = re.search(r"```text\n(.*?)\n```", md, re.DOTALL)
    if not m:
        raise ValueError("prompt.md に ```text ブロックが見つからない")
    return m.group(1)


def extract_prompt_version(md: str) -> str:
    m = re.search(r"prompt_version:\s*(\d+\.\d+\.\d+)", md)
    if not m:
        raise ValueError("prompt.md に prompt_version が見つからない")
    return m.group(1)


def load_prompt(usecase: str) -> tuple[str, str]:
    """(system_prompt, prompt_version)"""
    md = (LLM_DIR / usecase / "prompt.md").read_text(encoding="utf-8")
    return extract_system_prompt(md), extract_prompt_version(md)
