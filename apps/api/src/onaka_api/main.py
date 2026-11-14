"""アプリの入口。uvicorn と Lambda（Lambda Web Adapter）の両方でこのモジュールの app を動かす。

ローカル: ONAKA_REPOSITORY=memory ONAKA_LOCAL_USER_ID=local-dev uvicorn onaka_api.main:app --reload
AWS:     環境変数 ONAKA_TABLE_NAME・ONAKA_CLAUDE_API_KEY_PARAM などを SAM のテンプレートで設定する
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import FastAPI

from onaka_api.api.app import Deps, create_app
from onaka_api.clients.off import OffClient
from onaka_api.estimation import UpstreamUnavailable
from onaka_api.repository import MealRepository
from onaka_api.repository.memory import InMemoryMealRepository
from onaka_api.settings import Settings


class _NoClaude:
    """Claude の API キーがないときの代わり（起動はでき、推定だけ 502 にする）。"""

    def estimate(self, usecase: str, image: Mapping[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
        raise UpstreamUnavailable("Claude の API キーが設定されていない")


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _repository(settings: Settings) -> MealRepository:
    if settings.repository == "memory":
        return InMemoryMealRepository()
    if settings.repository == "dynamodb":
        import boto3

        from onaka_api.repository.dynamodb import DynamoMealRepository

        client = boto3.client("dynamodb", region_name=settings.aws_region, endpoint_url=settings.dynamodb_endpoint)
        return DynamoMealRepository(client, settings.table_name)
    raise ValueError(f"repository の値が不明: {settings.repository}（dynamodb / memory）")


def build_app(settings: Settings, *, anthropic_api_key: str | None) -> FastAPI:
    """設定から依存を作り、アプリを組み立てる。Claude のキーがなければ推定は 502 にする（起動はできる）。"""
    repo = _repository(settings)
    estimator: Any
    if anthropic_api_key:
        import anthropic

        from onaka_api.clients.claude import ClaudeEstimator

        client = anthropic.Anthropic(api_key=anthropic_api_key, timeout=settings.claude_timeout_s, max_retries=1)
        estimator = ClaudeEstimator(
            client,
            models={
                "nutrition-label-ocr": (settings.label_model, settings.label_effort),
                "food-photo-estimate": (settings.photo_model, settings.photo_effort),
            },
            max_tokens=settings.claude_max_tokens,
        )
    else:
        estimator = _NoClaude()
    products = OffClient(httpx.Client(), base_url=settings.off_base_url, timeout_s=settings.off_timeout_s)
    deps = Deps(repo=repo, estimator=estimator, products=products, now=_now, local_user_id=settings.local_user_id)
    return create_app(deps)


def _api_key(settings: Settings) -> str | None:
    """Claude の API キー。環境変数 ANTHROPIC_API_KEY、なければ SSM Parameter Store（AWS 上、SecureString）。"""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    if not settings.claude_api_key_param:
        return None
    import boto3

    ssm = boto3.client("ssm", region_name=settings.aws_region)
    res = ssm.get_parameter(Name=settings.claude_api_key_param, WithDecryption=True)
    return res["Parameter"]["Value"]  # type: ignore[no-any-return]


def _app() -> FastAPI:
    settings = Settings.from_env()
    return build_app(settings, anthropic_api_key=_api_key(settings))


def __getattr__(name: str) -> Any:
    # uvicorn・Lambda Web Adapter が onaka_api.main:app を読んだときに初めて組み立てる
    # （テストで import しただけでは SSM や DynamoDB に触らない）
    if name == "app":
        app = _app()
        globals()["app"] = app
        return app
    raise AttributeError(name)
