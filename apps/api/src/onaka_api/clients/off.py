"""Open Food Facts の呼び出し（F-011-10〜12）。"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from onaka_api.estimation.errors import UpstreamUnavailable

USER_AGENT = "onaka-log/0.1"  # 個人情報（メールアドレスなど）を含めない
log = logging.getLogger(__name__)


class OffClient:
    def __init__(self, http: httpx.Client, *, base_url: str, timeout_s: float = 5.0) -> None:
        self._http = http
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_s

    def fetch(self, product_code: str) -> dict[str, Any] | None:
        """商品の応答（JSON）。404 なら None。届かない・タイムアウト・5xx は UpstreamUnavailable。"""
        url = f"{self._base_url}/api/v2/product/{product_code}.json"
        try:
            res = self._http.get(url, headers={"User-Agent": USER_AGENT}, timeout=self._timeout)
        except httpx.HTTPError as e:
            log.warning("off_error error=%s", type(e).__name__)
            raise UpstreamUnavailable(f"Open Food Facts に届かない: {type(e).__name__}") from e
        if res.status_code == 404:
            return None
        if res.status_code != 200:
            log.warning("off_error status=%s", res.status_code)
            raise UpstreamUnavailable(f"Open Food Facts の応答が {res.status_code}")
        try:
            body = res.json()
        except ValueError as e:
            raise UpstreamUnavailable("Open Food Facts の応答が JSON ではない") from e
        if not isinstance(body, dict):
            raise UpstreamUnavailable("Open Food Facts の応答の形が違う")
        return body
