"""Claude の呼び出し（F-012-10〜13・F-013-10〜13）。anthropic のクライアントは差し替える（実際の API は呼ばない）。"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import pytest
from api_test_helpers import REPO_ROOT, fixture

from onaka_api.clients.claude import ClaudeEstimator, load_prompt, strip_unsupported
from onaka_api.estimation import EstimationFailed, UpstreamUnavailable

MODELS = {"nutrition-label-ocr": ("claude-haiku-5-5", "low"), "food-photo-estimate": ("claude-sonnet-5-5", "medium")}
IMAGE = {"media_type": "image/jpeg", "data_base64": "/9j/4AAQSkZJRg=="}
REQ = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


class FakeClient:
    def __init__(self, *, text: str | None = None, stop_reason: str = "end_turn", error: Exception | None = None):
        self.kwargs: dict[str, Any] = {}
        self._text, self._stop, self._error = text, stop_reason, error
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        if self._error:
            raise self._error
        content = [] if self._text is None else [SimpleNamespace(type="text", text=self._text)]
        usage = SimpleNamespace(input_tokens=5000, output_tokens=300)
        return SimpleNamespace(content=content, stop_reason=self._stop, usage=usage)


def ocr_output() -> dict[str, Any]:
    return fixture("llm", "nutrition-label-ocr", "single-column.json")["output"]  # type: ignore[no-any-return]


@pytest.mark.spec("F-012-10", "F-012-13")
def test_request_and_result_for_label() -> None:
    client = FakeClient(text=json.dumps(ocr_output(), ensure_ascii=False))
    output, estimation = ClaudeEstimator(client, models=MODELS, max_tokens=16000).estimate("nutrition-label-ocr", IMAGE)
    assert output == ocr_output()
    system, version = load_prompt("nutrition-label-ocr")
    schema = json.loads(
        (REPO_ROOT / "contracts/llm/nutrition-label-ocr/output.schema.json").read_text(encoding="utf-8")
    )
    assert estimation == {"model": "claude-haiku-5-5", "prompt_version": version, "schema_id": schema["$id"]}
    kw = client.kwargs
    assert kw["model"] == "claude-haiku-5-5" and kw["max_tokens"] == 16000 and kw["system"] == system
    assert kw["messages"] == [
        {"role": "user", "content": [{"type": "image", "source": {"type": "base64", **IMAGE_SOURCE}}]}
    ]
    assert kw["output_config"] == {
        "format": {"type": "json_schema", "schema": strip_unsupported(schema)},
        "effort": "low",
    }


IMAGE_SOURCE = {"media_type": "image/jpeg", "data": IMAGE["data_base64"]}


@pytest.mark.spec("F-013-10", "F-013-13")
def test_photo_uses_its_own_model_and_effort() -> None:
    out = fixture("llm", "food-photo-estimate", "chicken-natto.json")["output"]
    client = FakeClient(text=json.dumps(out, ensure_ascii=False))
    _, estimation = ClaudeEstimator(client, models=MODELS).estimate("food-photo-estimate", IMAGE)
    assert client.kwargs["model"] == "claude-sonnet-5-5"
    assert client.kwargs["output_config"]["effort"] == "medium"
    assert estimation["model"] == "claude-sonnet-5-5"
    assert estimation["schema_id"] == "urn:onaka-log:llm:food-photo-estimate:output:v0.1"


@pytest.mark.spec("F-012-11", "F-013-11")
@pytest.mark.parametrize(
    "client",
    [
        FakeClient(text="{}", stop_reason="refusal"),
        FakeClient(text='{"status": "o', stop_reason="max_tokens"),
        FakeClient(text="これは JSON ではない"),
        FakeClient(text=None),  # text ブロックがない
    ],
    ids=["refusal", "max_tokens", "not-json", "no-text"],
)
def test_unusable_responses_are_estimation_failed(client: FakeClient) -> None:
    with pytest.raises(EstimationFailed):
        ClaudeEstimator(client, models=MODELS).estimate("nutrition-label-ocr", IMAGE)


@pytest.mark.spec("F-012-12", "F-013-12")
@pytest.mark.parametrize(
    "error",
    [
        anthropic.APIConnectionError(request=REQ),
        anthropic.APITimeoutError(request=REQ),
        anthropic.RateLimitError("rate", response=httpx.Response(429, request=REQ), body=None),
        anthropic.InternalServerError("down", response=httpx.Response(529, request=REQ), body=None),
        anthropic.BadRequestError("bad", response=httpx.Response(400, request=REQ), body=None),
    ],
    ids=["connection", "timeout", "429", "529", "400"],
)
def test_api_errors_are_upstream_unavailable(error: Exception) -> None:
    with pytest.raises(UpstreamUnavailable):
        ClaudeEstimator(FakeClient(error=error), models=MODELS).estimate("nutrition-label-ocr", IMAGE)


@pytest.mark.spec("F-012-10")
def test_strip_unsupported_keeps_property_names() -> None:
    schema = {
        "type": "object",
        "properties": {"minimum": {"type": "number", "minimum": 0}, "pattern": {"type": "string", "pattern": "x"}},
        "$defs": {"maxLength": {"type": "string", "maxLength": 3}},
        "anyOf": [{"type": "integer", "exclusiveMinimum": 0}],
    }
    assert strip_unsupported(schema) == {
        "type": "object",
        "properties": {"minimum": {"type": "number"}, "pattern": {"type": "string"}},
        "$defs": {"maxLength": {"type": "string"}},
        "anyOf": [{"type": "integer"}],
    }


@pytest.mark.spec("F-012-10")
def test_load_prompt_reads_contract() -> None:
    system, version = load_prompt("nutrition-label-ocr")
    assert system.startswith("あなたは日本の食品パッケージ")
    assert "```" not in system and version == "0.2.0"
