"""栄養成分表示の出力から候補を作る（docs/01_requirements/features/F-012-label-ocr.md）。"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from api_test_helpers import api_schema_errors, fixture

from onaka_api.domain import build_item
from onaka_api.estimation import EstimationFailed, label_response

ESTIMATION = {
    "model": "claude-haiku-5-5",
    "prompt_version": "0.2.0",
    "schema_id": "urn:onaka-log:llm:nutrition-label-ocr:output:v0.3",
}
FIXTURES = ["single-column", "single-column-backlit", "two-columns-flavors", "unreadable"]


def output(name: str) -> dict[str, Any]:
    return fixture("llm", "nutrition-label-ocr", f"{name}.json")["output"]  # type: ignore[no-any-return]


def as_item_input(draft: dict[str, Any], n: int) -> dict[str, Any]:
    return {
        "item_id": f"0190f3a2-7c1e-7a01-8b2c-{n:012x}",
        "name": draft["name"],
        "source": draft["source"],
        "reference": draft["reference"],
        "estimate_detail": draft["estimate_detail"],
        "portion": draft["default_portion"],
    }


@pytest.mark.spec("F-012-02", "F-012-08")
@pytest.mark.parametrize("name", FIXTURES)
def test_response_matches_api_contract_and_domain(name: str) -> None:
    res = label_response(output(name), estimation=ESTIMATION)
    assert api_schema_errors("LabelEstimateResponse", res) == []
    # 候補は分量の既定のまま保存しても、ドメインのルールを満たす
    for n, draft in enumerate(res["candidates"]):
        build_item(as_item_input(draft, n))


@pytest.mark.spec("F-012-02")
def test_unreadable_has_no_candidates() -> None:
    res = label_response(output("unreadable"), estimation=ESTIMATION)
    assert res["status"] == "unreadable" and res["candidates"] == []
    assert res["issues"] == output("unreadable")["issues"]


@pytest.mark.spec("F-012-02", "F-012-03", "F-012-04", "F-012-06", "F-012-07")
def test_two_flavor_columns_become_two_candidates() -> None:
    out = output("two-columns-flavors")
    res = label_response(out, estimation=ESTIMATION)
    c = res["candidates"]
    # 記録した出力では商品名が読めていない（null）ので、名前は「名称不明の食品（見出し）」
    assert [d["name"] for d in c] == ["名称不明の食品（シュガー）", "名称不明の食品（チョコ）"]
    assert [d["source"]["column_index"] for d in c] == [0, 1]
    assert [d["source"]["column_heading"] for d in c] == ["シュガー", "チョコ"]
    assert c[1]["reference"]["nutrients"] == {
        "energy_kcal": 289,
        "protein_g": 1.7,
        "fat_g": 26.1,
        "carbohydrate_g": 11.7,
    }
    assert c[0]["reference"]["basis"] == {"type": "per_piece", "amount": None, "unit": None, "label": "1個当たり"}
    assert c[0]["reference"]["net_content"] == {"status": "known", "amount": None, "unit": None, "pieces": 4}
    assert c[0]["default_portion"] == {"mode": "pieces", "fraction": None, "pieces": 1}  # 4個入りは1個（Q-27）
    assert c[0]["source"]["estimation"] == ESTIMATION and c[0]["source"]["confidence"] == out["confidence"]
    assert res["issues"] == ["multiple_labels"]


@pytest.mark.spec("F-012-03")
def test_name_with_product_name_and_heading() -> None:
    out = copy.deepcopy(output("two-columns-flavors"))
    out["product_name"] = "ドーナツ"
    res = label_response(out, estimation=ESTIMATION)
    assert [d["name"] for d in res["candidates"]] == ["ドーナツ（シュガー）", "ドーナツ（チョコ）"]


@pytest.mark.spec("F-012-03", "F-012-05", "F-012-06", "F-012-07")
def test_single_column() -> None:
    out = output("single-column")
    res = label_response(out, estimation=ESTIMATION)
    (d,) = res["candidates"]
    assert d["source"]["column_index"] is None and d["source"]["column_heading"] is None
    assert d["source"]["method"] == "label_ocr" and d["source"]["provider"] == "claude"
    assert d["source"]["product_code"] is None and d["estimate_detail"] is None
    assert d["reference"]["net_content"]["status"] == "known"
    assert d["default_portion"] == {"mode": "whole", "fraction": None, "pieces": None}
    assert d["name"] == (out["product_name"] or "名称不明の食品")


@pytest.mark.spec("F-012-03", "F-012-05")
def test_missing_name_and_net_content() -> None:
    out = output("single-column-backlit")  # 内容量が写っていない
    out = copy.deepcopy(out)
    out["product_name"] = None
    res = label_response(out, estimation=ESTIMATION)
    (d,) = res["candidates"]
    assert d["name"] == "名称不明の食品"
    assert d["reference"]["net_content"] == {"status": "unknown", "amount": None, "unit": None, "pieces": None}


@pytest.mark.spec("F-012-04")
def test_salt_is_dropped_and_null_kept() -> None:
    out = copy.deepcopy(output("single-column"))
    out["columns"][0]["nutrients"]["fat_g"] = None
    (d,) = label_response(out, estimation=ESTIMATION)["candidates"]
    assert set(d["reference"]["nutrients"]) == {"energy_kcal", "protein_g", "fat_g", "carbohydrate_g"}
    assert d["reference"]["nutrients"]["fat_g"] is None


@pytest.mark.spec("F-012-01")
@pytest.mark.parametrize(
    "broken",
    [
        lambda o: o.pop("issues"),  # スキーマ違反（必須の項目がない）
        lambda o: o.update(status="unreadable"),  # 意味上のルール違反（ok 以外なのに列がある）
        lambda o: o["columns"][0]["nutrients"].update(energy_kcal=None),  # ok なのにエネルギーが null
        lambda o: o["columns"][0]["nutrients"].update(protein_g=-1),  # 完全版スキーマの下限
    ],
)
def test_invalid_output_is_estimation_failed(broken: Any) -> None:
    out = copy.deepcopy(output("single-column"))
    broken(out)
    with pytest.raises(EstimationFailed):
        label_response(out, estimation=ESTIMATION)
