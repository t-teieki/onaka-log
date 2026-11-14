"""デプロイ済みの dev の API に対する実 API のスモーク（TST-05、strategy.md §3-2 ⑧）。

既定では動かさない（`-m live` のときだけ）。Claude を2回呼ぶ（OCR は Haiku・写真は Sonnet、合わせて数円）。
画像は手元の poc/samples を使い（Git 管理外）、メモリ上で長辺 1024px の JPEG にしてから送る（ADR-0004）。

必要なもの:
- ONAKA_LIVE_API_URL: dev の API の URL（例 https://xxxx.execute-api.ap-northeast-1.amazonaws.com/v1）
- ONAKA_LIVE_TOKEN_FILE: Cognito のアクセストークンを書いたファイル（既定 ~/.onaka-dev-token、infra/README.md）
- pillow（`--group poc`）

実行: uv run --group dev --group poc pytest apps/api/tests/live -m live -q
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from api_test_helpers import REPO_ROOT, api_schema_errors

pytestmark = pytest.mark.live

SAMPLES = REPO_ROOT / "poc" / "samples"
TIMEOUT_S = 40.0


@pytest.fixture(scope="module")
def client() -> Iterator[httpx.Client]:
    url = os.environ.get("ONAKA_LIVE_API_URL")
    token_file = Path(os.environ.get("ONAKA_LIVE_TOKEN_FILE", "~/.onaka-dev-token")).expanduser()
    if not url or not token_file.exists():
        pytest.skip("ONAKA_LIVE_API_URL とトークンのファイルが要る（infra/README.md）")
    token = token_file.read_text(encoding="utf-8").strip()
    with httpx.Client(base_url=url.rstrip("/"), headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT_S) as c:
        yield c


def _image(kind: str, name: str) -> dict[str, str]:
    path = SAMPLES / kind / "images" / name
    if not path.exists():
        pytest.skip(f"サンプル画像がない: {path}（Git 管理外）")
    pytest.importorskip("PIL")
    sys.path.insert(0, str(REPO_ROOT / "poc"))
    from shared.images import prepare_image

    data, _, _, _ = prepare_image(path, max_edge=1024)
    return {"media_type": "image/jpeg", "data_base64": data}


def _ok(res: httpx.Response, component: str) -> Any:
    assert res.status_code == 200, res.text
    body = res.json()
    assert api_schema_errors(component, body) == []
    return body


def test_label_estimate_reads_kcal_from_real_label(client: httpx.Client) -> None:
    # L002: 明治のチョコレート菓子、1箱(63g)当たり 345 kcal（poc/samples/label/ground_truth.csv）
    body = _ok(
        client.post("/estimates/label", json={"image": _image("label", "L002.jpg"), "locale": "ja-JP"}),
        "LabelEstimateResponse",
    )
    assert body["status"] == "ok"
    kcals = [c["reference"]["nutrients"]["energy_kcal"] for c in body["candidates"]]
    assert 345 in kcals


def test_photo_estimate_returns_items(client: httpx.Client) -> None:
    body = _ok(
        client.post("/estimates/photo", json={"image": _image("photo", "P001.jpg"), "locale": "ja-JP"}),
        "PhotoEstimateResponse",
    )
    assert body["status"] == "ok"
    assert len(body["items"]) >= 1
    assert all(i["reference"]["nutrients"]["energy_kcal"] is not None for i in body["items"])


def test_product_lookup_calls_open_food_facts(client: httpx.Client) -> None:
    # 見つかるかは Open Food Facts の登録しだいなので、形と status だけを確かめる
    body = _ok(client.get("/products/4902888323324"), "ProductLookupResponse")
    assert body["status"] in {"found", "not_found"}
