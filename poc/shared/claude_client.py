"""Claude 呼び出しのラッパー。結果は dict で返す（例外は握って error に入れる）。

- thinking / temperature / top_p / top_k は渡さない（thinking は既定で adaptive）
- refusal のフォールバックはしない（モデル比較が混ざるため）。stop_reason が
  refusal / max_tokens の場合はエラー結果として返す
"""

from __future__ import annotations

import json
import time
from typing import Any

import anthropic

DEFAULT_MAX_TOKENS = 16000


def usage_to_dict(usage: Any) -> dict[str, int]:
    return {
        "input_tokens": getattr(usage, "input_tokens", 0) or 0,
        "output_tokens": getattr(usage, "output_tokens", 0) or 0,
        "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
    }


def first_text(content: list[Any]) -> str | None:
    """最初の text ブロックの本文（thinking ブロックが先に来ることがある）。"""
    for block in content:
        if getattr(block, "type", None) == "text":
            return block.text
    return None


def call_image(
    client: anthropic.Anthropic,
    *,
    model: str,
    system: str,
    api_schema: dict,
    image_b64: str,
    effort: str,
    media_type: str = "image/jpeg",
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict:
    result: dict[str, Any] = {
        "model": model,
        "effort": effort,
        "parsed": None,
        "error": None,
        "stop_reason": None,
        "usage": {},
        "latency_s": None,
    }
    t0 = time.perf_counter()
    try:
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{
                "role": "user",
                "content": [{
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                }],
            }],
            output_config={
                "format": {"type": "json_schema", "schema": api_schema},
                "effort": effort,
            },
        )
    except anthropic.RateLimitError as e:
        result["error"] = f"RateLimitError: {e}"
    except anthropic.APIStatusError as e:
        result["error"] = f"APIStatusError {e.status_code}: {e.message}"
    except anthropic.APIConnectionError as e:
        result["error"] = f"APIConnectionError: {e}"
    else:
        result["stop_reason"] = resp.stop_reason
        result["usage"] = usage_to_dict(resp.usage)
        if resp.stop_reason in ("refusal", "max_tokens"):
            result["error"] = f"stop_reason={resp.stop_reason}"
        else:
            text = first_text(resp.content)
            if text is None:
                result["error"] = "text ブロックがない"
            else:
                try:
                    result["parsed"] = json.loads(text)
                except json.JSONDecodeError as e:
                    result["error"] = f"JSON parse error: {e}"
                    result["raw_text"] = text[:2000]
    result["latency_s"] = time.perf_counter() - t0
    return result
