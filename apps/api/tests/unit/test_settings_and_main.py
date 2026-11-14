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
