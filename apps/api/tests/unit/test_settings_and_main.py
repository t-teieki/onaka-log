"""設定（環境変数）と、設定からアプリを組み立てる入口（main.build_app）。"""

from __future__ import annotations

import pytest
from api_test_helpers import item_inputs, meal_id
from fastapi.testclient import TestClient

from onaka_api.main import build_app
from onaka_api.settings import Settings


def test_settings_from_env_converts_types_and_keeps_defaults() -> None:
    s = Settings.from_env(
        {
            "ONAKA_TABLE_NAME": "onaka-log-dev",
            "ONAKA_CLAUDE_MAX_TOKENS": "8000",
            "ONAKA_OFF_TIMEOUT_S": "2.5",
            "ONAKA_PHOTO_MODEL": "claude-opus-5-5",
            "ONAKA_LOCAL_USER_ID": "",  # 空は未設定と同じ
            "OTHER": "x",
        }
    )
    assert s.table_name == "onaka-log-dev" and s.claude_max_tokens == 8000 and s.off_timeout_s == 2.5
    assert s.photo_model == "claude-opus-5-5" and s.label_model == "claude-haiku-5-5"
    assert s.local_user_id is None and s.repository == "dynamodb"


@pytest.mark.spec("F-001-03")
def test_build_app_with_memory_repository_and_no_claude_key() -> None:
    app = build_app(Settings(repository="memory", local_user_id="local-dev"), anthropic_api_key=None)
    client = TestClient(app)
    body = {"meal_id": meal_id(1), "eaten_at": "2026-11-13T12:30:00+09:00", "items": item_inputs("meal-manual.json")}
    assert client.post("/v1/meals", json=body).status_code == 201
    assert client.get("/v1/days/2026-11-13").json()["meals"][0]["user_id"] == "local-dev"
    # Claude のキーがないときは、推定は 502（起動はできる）
    image = {"image": {"media_type": "image/jpeg", "data_base64": "/9j/"}, "locale": "ja-JP"}
    res = client.post("/v1/estimates/label", json=image)
    assert res.status_code == 502 and res.json()["error"]["code"] == "upstream_unavailable"


def test_unknown_repository_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_app(Settings(repository="sqlite"), anthropic_api_key=None)


# --- コールドスタート対策（ADR-0007、2026-11-16）: Claude のキーと SDK は推定の初回まで読まない

IMAGE = {"media_type": "image/jpeg", "data_base64": "/9j/"}


class _FakeEstimator:
    def estimate(self, usecase: str, image: object) -> tuple[dict[str, object], dict[str, object]]:
        return {"usecase": usecase}, {"model": "fake"}


def test_build_app_does_not_read_the_claude_key_until_an_estimate() -> None:
    calls: list[str] = []

    def load_key() -> str | None:
        calls.append("load")
        return None

    app = build_app(Settings(repository="memory", local_user_id="local-dev"), load_api_key=load_key)
    client = TestClient(app)
    assert client.get("/v1/days/2026-11-13").status_code == 200
    assert calls == []
    # キーがなければ推定は 502（起動はできる）
    res = client.post("/v1/estimates/photo", json={"image": IMAGE, "locale": "ja-JP"})
    assert res.status_code == 502 and res.json()["error"]["code"] == "upstream_unavailable"
    assert calls == ["load"]


def test_lazy_claude_reads_the_key_once_and_reuses_the_estimator() -> None:
    from onaka_api.main import LazyClaude

    keys: list[str] = []
    made: list[str] = []

    def load_key() -> str | None:
        keys.append("load")
        return "test-key"

    def make(key: str) -> _FakeEstimator:
        made.append(key)
        return _FakeEstimator()

    lazy = LazyClaude(load_key, make)
    assert keys == [] and made == []
    assert lazy.estimate("food-photo-estimate", IMAGE)[0] == {"usecase": "food-photo-estimate"}
    assert lazy.estimate("nutrition-label-ocr", IMAGE)[0] == {"usecase": "nutrition-label-ocr"}
    assert keys == ["load"] and made == ["test-key"]


def test_lazy_claude_retries_reading_the_key_after_a_failure() -> None:
    from onaka_api.estimation import UpstreamUnavailable
    from onaka_api.main import LazyClaude

    attempts: list[int] = []

    def load_key() -> str | None:
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("SSM に届かない")
        return "test-key"

    lazy = LazyClaude(load_key, lambda key: _FakeEstimator())
    with pytest.raises(UpstreamUnavailable):
        lazy.estimate("food-photo-estimate", IMAGE)
    assert lazy.estimate("food-photo-estimate", IMAGE)[1] == {"model": "fake"}
    assert len(attempts) == 2


def test_building_the_app_does_not_import_the_anthropic_sdk() -> None:
    import subprocess
    import sys

    code = (
        "import sys\n"
        "from onaka_api.main import build_app\n"
        "from onaka_api.settings import Settings\n"
        "build_app(Settings(repository='memory'), load_api_key=lambda: 'test-key')\n"
        "print('anthropic' in sys.modules)\n"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "False"
