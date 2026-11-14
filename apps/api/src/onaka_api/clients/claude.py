"""Claude の呼び出し（F-012-10〜14・F-013-10〜14）。プロンプトとスキーマは contracts/llm から読む。"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Mapping
from functools import lru_cache
from typing import Any

import anthropic

from onaka_api.estimation.contracts import contracts_dir
from onaka_api.estimation.errors import EstimationFailed, UpstreamUnavailable

JsonDict = dict[str, Any]
log = logging.getLogger(__name__)

# Structured Outputs の API が受け付けないキーワード（取り除いて送り、完全版のスキーマで受け取った後に検証する）
UNSUPPORTED_KEYWORDS = (
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "pattern",
    "uniqueItems",
)


def strip_unsupported(schema: Any) -> Any:
    """スキーマから UNSUPPORTED_KEYWORDS を再帰的に取り除く（properties・$defs の中の名前は残す）。"""
    if isinstance(schema, list):
        return [strip_unsupported(v) for v in schema]
    if not isinstance(schema, dict):
        return schema
    out: JsonDict = {}
    for key, value in schema.items():
        if key in ("properties", "$defs") and isinstance(value, dict):
            out[key] = {name: strip_unsupported(sub) for name, sub in value.items()}
        elif key not in UNSUPPORTED_KEYWORDS:
            out[key] = strip_unsupported(value)
    return out


@lru_cache(maxsize=8)
def load_prompt(usecase: str) -> tuple[str, str]:
    """contracts/llm/<usecase>/prompt.md から (システムプロンプト, prompt_version)。"""
    md = (contracts_dir() / "llm" / usecase / "prompt.md").read_text(encoding="utf-8")
    system = re.search(r"## システムプロンプト\s*```text\n(.*?)\n```", md, re.S)
    version = re.search(r"prompt_version: (\d+\.\d+\.\d+)", md)
    if not system or not version:
        raise ValueError(f"{usecase} の prompt.md からプロンプトか版を読めない")
    return system.group(1).strip(), version.group(1)


@lru_cache(maxsize=8)
def _output_schema(usecase: str) -> JsonDict:
    path = contracts_dir() / "llm" / usecase / "output.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


class ClaudeEstimator:
    """用途ごとのモデル・effort で Claude を呼び、(出力, estimation) を返す。"""

    def __init__(self, client: Any, *, models: Mapping[str, tuple[str, str]], max_tokens: int = 16000) -> None:
        """models は 用途 → (モデルID, effort)。client は anthropic.Anthropic（テストでは差し替える）。"""
        self._client = client
        self._models = dict(models)
        self._max_tokens = max_tokens

    def estimate(self, usecase: str, image: Mapping[str, str]) -> tuple[JsonDict, JsonDict]:
        """image は {media_type, data_base64}。返り値は (Claude の出力, {model, prompt_version, schema_id})。"""
        model, effort = self._models[usecase]
        system, prompt_version = load_prompt(usecase)
        schema = _output_schema(usecase)
        started = time.monotonic()
        try:
            res = self._client.messages.create(
                model=model,
                max_tokens=self._max_tokens,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": image["media_type"],
                                    "data": image["data_base64"],
                                },
                            }
                        ],
                    }
                ],
                output_config={
                    "format": {"type": "json_schema", "schema": strip_unsupported(schema)},
                    "effort": effort,
                },
            )
        except (anthropic.APIConnectionError, anthropic.APIStatusError) as e:
            # 画像・プロンプトはログに出さない（F-012-14）。種類だけ
            log.warning("claude_error usecase=%s model=%s error=%s", usecase, model, type(e).__name__)
            raise UpstreamUnavailable(f"Claude を呼べない: {type(e).__name__}") from e

        usage = getattr(res, "usage", None)
        log.info(
            "claude_call usecase=%s model=%s stop_reason=%s input_tokens=%s output_tokens=%s seconds=%.2f",
            usecase,
            model,
            res.stop_reason,
            getattr(usage, "input_tokens", None),
            getattr(usage, "output_tokens", None),
            time.monotonic() - started,
        )
        if res.stop_reason in ("refusal", "max_tokens"):
            raise EstimationFailed(f"stop_reason={res.stop_reason}")
        text = next((b.text for b in res.content if getattr(b, "type", None) == "text"), None)
        if text is None:
            raise EstimationFailed("text ブロックがない")
        try:
            output = json.loads(text)
        except json.JSONDecodeError as e:
            raise EstimationFailed("出力が JSON ではない") from e
        if not isinstance(output, dict):
            raise EstimationFailed("出力が JSON のオブジェクトではない")
        estimation = {"model": model, "prompt_version": prompt_version, "schema_id": schema["$id"]}
        return output, estimation
