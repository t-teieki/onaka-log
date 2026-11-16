"""アプリの入口。uvicorn と Lambda（Lambda Web Adapter）の両方でこのモジュールの app を動かす。

ローカル: ONAKA_REPOSITORY=memory ONAKA_LOCAL_USER_ID=local-dev uvicorn onaka_api.main:app --reload
AWS:     環境変数 ONAKA_TABLE_NAME・ONAKA_CLAUDE_API_KEY_PARAM などを SAM のテンプレートで設定する
"""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable, Mapping
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

log = logging.getLogger(__name__)

Estimate = tuple[dict[str, Any], dict[str, Any]]


class _NoClaude:
    """Claude の API キーがないときの代わり（起動はでき、推定だけ 502 にする）。"""

    def estimate(self, usecase: str, image: Mapping[str, str]) -> Estimate:
        raise UpstreamUnavailable("Claude の API キーが設定されていない")


class LazyClaude:
    """Claude の API キーの読み取り（SSM）と SDK の import を推定の初回まで遅らせる（ADR-0007、コールドスタート）。

    一覧・保存・照合しか呼ばれないコンテナでは読まない。読めたら作った推定器を使い回し、
    読めなかったら（SSM に届かないなど）502 にして、次の推定で読み直す。
    """

    def __init__(self, load_key: Callable[[], str | None], make: Callable[[str], Any]) -> None:
        self._load_key = load_key
        self._make = make
        self._estimator: Any = None
        self._lock = threading.Lock()

    def _get(self) -> Any:
        with self._lock:
            if self._estimator is None:
                try:
                    key = self._load_key()
                except Exception as e:
                    log.warning("Claude の API キーを読めない: %s", type(e).__name__)
                    raise UpstreamUnavailable("Claude の API キーを読めない") from e
                self._estimator = self._make(key) if key else _NoClaude()
            return self._estimator

    def estimate(self, usecase: str, image: Mapping[str, str]) -> Estimate:
        return self._get().estimate(usecase, image)  # type: ignore[no-any-return]


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


def _claude_estimator(settings: Settings, api_key: str) -> Any:
    """Claude の推定器を作る。SDK はここで初めて import する（重いので起動時には読まない）。"""
    import anthropic

    from onaka_api.clients.claude import ClaudeEstimator

    client = anthropic.Anthropic(api_key=api_key, timeout=settings.claude_timeout_s, max_retries=1)
    return ClaudeEstimator(
        client,
        models={
            "nutrition-label-ocr": (settings.label_model, settings.label_effort),
            "food-photo-estimate": (settings.photo_model, settings.photo_effort),
        },
        max_tokens=settings.claude_max_tokens,
    )


def build_app(
    settings: Settings,
    *,
    anthropic_api_key: str | None = None,
    load_api_key: Callable[[], str | None] | None = None,
) -> FastAPI:
    """設定から依存を作り、アプリを組み立てる。Claude のキーがなければ推定は 502 にする（起動はできる）。

    キーは値（anthropic_api_key）か、推定の初回に呼ぶ読み取り（load_api_key、SSM など）で渡す。
    どちらの場合も SDK の import は推定の初回まで遅らせる。
    """
    repo = _repository(settings)
    estimator = LazyClaude(
        load_api_key if load_api_key is not None else lambda: anthropic_api_key,
        lambda key: _claude_estimator(settings, key),
    )
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
    return build_app(settings, load_api_key=lambda: _api_key(settings))


def __getattr__(name: str) -> Any:
    # uvicorn・Lambda Web Adapter が onaka_api.main:app を読んだときに初めて組み立てる
    # （テストで import しただけでは SSM や DynamoDB に触らない）
    if name == "app":
        app = _app()
        globals()["app"] = app
        return app
    raise AttributeError(name)
