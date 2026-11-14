"""写真推定の出力から候補を作る（docs/01_requirements/features/F-013-photo.md）。"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from api_test_helpers import api_schema_errors, fixture

from onaka_api.domain import build_item
from onaka_api.estimation import EstimationFailed, photo_response

ESTIMATION = {
    "model": "claude-sonnet-5-5",
    "prompt_version": "0.2.0",
    "schema_id": "urn:onaka-log:llm:food-photo-estimate:output:v0.1",
}
FIXTURES = ["hamburg-teishoku", "chicken-natto", "roastbeef-salad", "wagashi-single", "pork-teishoku"]


def output(name: str) -> dict[str, Any]:
    return fixture("llm", "food-photo-estimate", f"{name}.json")["output"]  # type: ignore[no-any-return]


@pytest.mark.spec("F-013-02", "F-013-08")
@pytest.mark.parametrize("name", FIXTURES)
def test_response_matches_api_contract_and_domain(name: str) -> None:
    out = output(name)
    res = photo_response(out, estimation=ESTIMATION)
    assert api_schema_errors("PhotoEstimateResponse", res) == []
    assert len(res["items"]) == len(out["items"])
    assert res["meal_name"] == out["meal_name"] and res["assumptions"] == out["assumptions"]
    for n, draft in enumerate(res["items"]):
        build_item(
            {
                "item_id": f"0190f3a2-7c1e-7a01-8b2c-{n:012x}",
                **{k: draft[k] for k in ("name", "source", "reference", "estimate_detail")},
                "portion": draft["default_portion"],
            }
        )


@pytest.mark.spec("F-013-03", "F-013-04", "F-013-05", "F-013-06", "F-013-07")
def test_item_conversion() -> None:
    out = output("chicken-natto")
    res = photo_response(out, estimation=ESTIMATION)
    src, d = out["items"][2], res["items"][2]
    assert d["name"] == src["name"]
    assert d["reference"] == {
        "basis": {"type": "as_estimated", "amount": None, "unit": None, "label": None},
        "net_content": None,
        "nutrients": src["nutrients"],
    }
    assert d["estimate_detail"] == {
        "amount_value": src["amount"]["value"],
        "amount_unit": src["amount"]["unit"],
        "estimated_weight_g": src["estimated_weight_g"],
    }
    assert d["source"] == {
        "method": "photo",
        "provider": "claude",
        "product_code": None,
        "estimation": ESTIMATION,
        "confidence": src["confidence"],
        "column_index": None,
        "column_heading": None,
    }
    assert d["default_portion"] == {"mode": "whole", "fraction": None, "pieces": None}


@pytest.mark.spec("F-013-02")
def test_not_food_has_no_items() -> None:
    out = {"status": "not_food", "meal_name": None, "items": [], "assumptions": [], "notes": "食べ物が写っていない"}
    res = photo_response(out, estimation=ESTIMATION)
    assert res == {
        "status": "not_food",
        "meal_name": None,
        "items": [],
        "assumptions": [],
        "notes": "食べ物が写っていない",
    }


@pytest.mark.spec("F-013-01")
@pytest.mark.parametrize(
    "broken",
    [
        lambda o: o.update(status="not_food"),  # ok 以外なのに品目がある
        lambda o: o.update(items=[]),  # ok なのに品目がない
        lambda o: o["items"][0].pop("confidence"),  # スキーマ違反
        lambda o: o["items"][0]["nutrients"].update(energy_kcal=None),  # 写真推定の値は null 不可
    ],
)
def test_invalid_output_is_estimation_failed(broken: Any) -> None:
    out = copy.deepcopy(output("hamburg-teishoku"))
    broken(out)
    with pytest.raises(EstimationFailed):
        photo_response(out, estimation=ESTIMATION)
