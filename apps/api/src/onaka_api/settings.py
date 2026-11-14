"""設定（環境変数から読む）。モデルID・effort は用途ごとに持つ（LLM-08、ADR-0010・0011）。"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, fields
from typing import Any


@dataclass(frozen=True)
class Settings:
    repository: str = "dynamodb"  # dynamodb / memory（memory はローカルの動作確認用。再起動で消える）
    table_name: str = "onaka-log-local"
    dynamodb_endpoint: str | None = None  # DynamoDB Local のとき（例 http://localhost:8000）
    aws_region: str = "ap-northeast-1"
    label_model: str = "claude-haiku-5-5"
    label_effort: str = "low"
    photo_model: str = "claude-sonnet-5-5"
    photo_effort: str = "medium"
    claude_max_tokens: int = 16000
    claude_timeout_s: float = 30.0
    claude_api_key_param: str | None = None  # SSM Parameter Store の名前（AWS 上）
    off_base_url: str = "https://world.openfoodfacts.org"
    off_timeout_s: float = 5.0
    local_user_id: str | None = None  # ローカル開発のときだけ（F-001-03）

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        """ONAKA_ で始まる環境変数から読む（例 ONAKA_TABLE_NAME）。ないものは既定値。"""
        env = os.environ if env is None else env
        values: dict[str, Any] = {}
        for f in fields(cls):
            raw = env.get(f"ONAKA_{f.name.upper()}")
            if raw is None or raw == "":
                continue
            default: Any = f.default
            values[f.name] = int(raw) if isinstance(default, int) else float(raw) if isinstance(default, float) else raw
        return cls(**values)
