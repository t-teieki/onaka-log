"""Open Food Facts API クライアント（キャッシュ・リトライ・レート配慮つき）。"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

BASE_URL = "https://world.openfoodfacts.org/api/v2/product/{jan}.json"
USER_AGENT = "onaka-log-poc/0.1 (personal research)"
FIELDS = (
    "code,product_name,product_name_ja,nutriments,nutrition_data_per,"
    "quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity"
)
TIMEOUT = 15.0
MAX_RETRIES = 2
MIN_INTERVAL = 1.0

_last_request = 0.0


def _throttle() -> None:
    global _last_request
    wait = MIN_INTERVAL - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()


def _fetch(client: httpx.Client, jan: str) -> dict:
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        if attempt:
            time.sleep(2.0 * attempt)  # バックオフ
        _throttle()
        try:
            resp = client.get(BASE_URL.format(jan=jan), params={"fields": FIELDS})
            if resp.status_code == 404:
                # 商品なしは正常な結果。本文があればそれを、無ければ status 0 を返す
                try:
                    return resp.json()
                except ValueError:
                    return {"code": jan, "status": 0, "status_verbose": "product not found"}
            if resp.status_code == 429 or resp.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"HTTP {resp.status_code}", request=resp.request, response=resp
                )
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as e:
            last_err = e
    raise RuntimeError(f"OFF fetch failed for {jan}: {last_err}")


def get_product(
    jan: str, cache_dir: Path, refresh: bool = False, client: httpx.Client | None = None
) -> tuple[dict, bool]:
    """(応答, キャッシュから読んだか)。キャッシュがあれば再利用し、なければ取得して保存する。"""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{jan}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8")), True
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT})
    try:
        data = _fetch(client, jan)
    finally:
        if own:
            client.close()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data, False
