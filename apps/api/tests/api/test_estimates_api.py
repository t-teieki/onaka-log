"""推定・照合の API（F-011・F-012・F-013 の API の層）。Claude と OFF は差し替える。"""

from __future__ import annotations

from typing import Any

import pytest
from api_test_helpers import NOW, FakeEstimator, FakeProducts, api_schema_errors, auth, fixture
from fastapi.testclient import TestClient

from onaka_api.api.app import MAX_IMAGE_CHARS, Deps, create_app
from onaka_api.estimation import EstimationFailed, UpstreamUnavailable
from onaka_api.repository.memory import InMemoryMealRepository

IMAGE_BODY = {"image": {"media_type": "image/jpeg", "data_base64": "/9j/4AAQSkZJRg=="}, "locale": "ja-JP"}
OUTPUTS = {
    "nutrition-label-ocr": fixture("llm", "nutrition-label-ocr", "two-columns-flavors.json"),
    "food-photo-estimate": fixture("llm", "food-photo-estimate", "hamburg-teishoku.json"),
}


def make(estimator: Any = None, products: Any = None) -> TestClient:
    deps = Deps(
        repo=InMemoryMealRepository(),
        estimator=estimator or FakeEstimator(OUTPUTS),
        products=products or FakeProducts({"4901234567900": fixture("off", "net-quantity-g.json")}),
        now=lambda: NOW,
    )
    return TestClient(create_app(deps))


def code(res: Any) -> str:
    assert api_schema_errors("Error", res.json()) == [], res.json()
    return res.json()["error"]["code"]  # type: ignore[no-any-return]


@pytest.mark.spec("F-012-02", "F-012-13")
def test_label_estimate() -> None:
    est = FakeEstimator(OUTPUTS)
    res = make(est).post("/v1/estimates/label", json=IMAGE_BODY, headers=auth())
    assert res.status_code == 200, res.text
    body = res.json()
    assert api_schema_errors("LabelEstimateResponse", body) == []
    assert len(body["candidates"]) == 2
    assert body["candidates"][0]["source"]["estimation"]["model"] == OUTPUTS["nutrition-label-ocr"]["meta"]["model"]
    assert est.calls == [("nutrition-label-ocr", IMAGE_BODY["image"])]


@pytest.mark.spec("F-013-02", "F-013-13")
def test_photo_estimate() -> None:
    res = make().post("/v1/estimates/photo", json=IMAGE_BODY, headers=auth())
    assert res.status_code == 200, res.text
    assert api_schema_errors("PhotoEstimateResponse", res.json()) == []
    assert len(res.json()["items"]) == len(OUTPUTS["food-photo-estimate"]["output"]["items"])


@pytest.mark.spec("F-012-09", "F-013-09")
@pytest.mark.parametrize("path", ["/v1/estimates/label", "/v1/estimates/photo"])
def test_invalid_image_body(path: str) -> None:
    bad = {"image": {"media_type": "image/gif", "data_base64": "AAAA"}, "locale": "ja-JP"}
    res = make().post(path, json=bad, headers=auth())
    assert res.status_code == 400 and code(res) == "validation_error"


@pytest.mark.spec("F-012-09", "F-013-09")
@pytest.mark.parametrize("path", ["/v1/estimates/label", "/v1/estimates/photo"])
def test_too_large_image(path: str) -> None:
    big = {"image": {"media_type": "image/jpeg", "data_base64": "A" * (MAX_IMAGE_CHARS + 1)}, "locale": "ja-JP"}
    res = make().post(path, json=big, headers=auth())
    assert res.status_code == 413 and code(res) == "payload_too_large"


@pytest.mark.spec("F-012-01", "F-012-11", "F-013-01", "F-013-11")
def test_estimation_failed_is_422() -> None:
    res = make(FakeEstimator(error=EstimationFailed("refusal"))).post(
        "/v1/estimates/label", json=IMAGE_BODY, headers=auth()
    )
    assert res.status_code == 422 and code(res) == "estimation_failed"


@pytest.mark.spec("F-012-01")
def test_contract_violating_output_is_422() -> None:
    broken = {
        "nutrition-label-ocr": {"meta": OUTPUTS["nutrition-label-ocr"]["meta"], "output": {"status": "ok"}}
    }  # 出力スキーマに合わない
    res = make(FakeEstimator(broken)).post("/v1/estimates/label", json=IMAGE_BODY, headers=auth())
    assert res.status_code == 422 and code(res) == "estimation_failed"


@pytest.mark.spec("F-012-12", "F-013-12", "F-011-10")
def test_upstream_unavailable_is_502() -> None:
    res = make(FakeEstimator(error=UpstreamUnavailable("down"))).post(
        "/v1/estimates/photo", json=IMAGE_BODY, headers=auth()
    )
    assert res.status_code == 502 and code(res) == "upstream_unavailable"
    res = make(products=FakeProducts(error=UpstreamUnavailable("down"))).get(
        "/v1/products/4901234567900", headers=auth()
    )
    assert res.status_code == 502 and code(res) == "upstream_unavailable"


@pytest.mark.spec("F-011-01", "F-011-12")
def test_product_lookup() -> None:
    client = make()
    found = client.get("/v1/products/4901234567900", headers=auth())
    assert found.status_code == 200 and found.json()["status"] == "found"
    assert api_schema_errors("ProductLookupResponse", found.json()) == []
    missing = client.get("/v1/products/4900000000000", headers=auth())
    assert missing.status_code == 200 and missing.json() == {"status": "not_found", "item": None}


@pytest.mark.spec("F-011-09")
@pytest.mark.parametrize("code_", ["123", "49012345678901234", "49012345a"])
def test_bad_product_code(code_: str) -> None:
    res = make().get(f"/v1/products/{code_}", headers=auth())
    assert res.status_code == 400 and code(res) == "validation_error"


@pytest.mark.spec("F-001-02")
@pytest.mark.parametrize(
    "method,path",
    [("post", "/v1/estimates/label"), ("post", "/v1/estimates/photo"), ("get", "/v1/products/4901234567900")],
)
def test_estimates_need_user(method: str, path: str) -> None:
    client = make()
    res = client.post(path, json=IMAGE_BODY) if method == "post" else client.get(path)
    assert res.status_code == 401 and code(res) == "unauthorized"
