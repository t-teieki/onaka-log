"""Open Food Facts の応答から候補を作る（docs/01_requirements/features/F-011-barcode.md）。

フィクスチャは Open Food Facts の応答の形をまねた合成データ（実在の商品ではない）。
"""

from __future__ import annotations

from typing import Any

import pytest
from api_test_helpers import api_schema_errors, fixture

from onaka_api.domain import build_item
from onaka_api.estimation import product_response

FOUND = [
    "net-quantity-g",
    "quantity-text-liter",
    "serving-only",
    "no-quantity-kj-only",
    "energy-only-in-energy-field",
]


def off(name: str) -> dict[str, Any]:
    return fixture("off", f"{name}.json")  # type: ignore[no-any-return]


def found(name: str) -> dict[str, Any]:
    payload = off(name)
    res = product_response(payload["code"], payload)
    assert res["status"] == "found", res
    return res["item"]  # type: ignore[no-any-return]


@pytest.mark.spec("F-011-01", "F-011-07", "F-011-08")
@pytest.mark.parametrize("name", FOUND)
def test_found_matches_api_contract_and_domain(name: str) -> None:
    payload = off(name)
    res = product_response(payload["code"], payload)
    assert api_schema_errors("ProductLookupResponse", res) == []
    d = res["item"]
    assert d["source"] == {
        "method": "barcode",
        "provider": "open_food_facts",
        "product_code": payload["code"],
        "estimation": None,
        "confidence": None,
        "column_index": None,
        "column_heading": None,
    }
    assert d["estimate_detail"] is None
    assert d["default_portion"] == {"mode": "whole", "fraction": None, "pieces": None}
    build_item(
        {
            "item_id": "0190f3a2-7c1e-7a01-8b2c-000000000001",
            **{k: d[k] for k in ("name", "source", "reference", "estimate_detail")},
            "portion": d["default_portion"],
        }
    )


@pytest.mark.spec("F-011-01", "F-011-10")
@pytest.mark.parametrize("name", ["not-found", "no-energy"])
def test_not_found(name: str) -> None:
    payload = off(name)
    res = product_response(payload["code"], payload)
    assert res == {"status": "not_found", "item": None}


@pytest.mark.spec("F-011-01", "F-011-10")
def test_missing_payload_is_not_found() -> None:
    # OFF の 404（応答の本文がない）は HTTP クライアントが None にして渡す
    assert product_response("4900000000000", None) == {"status": "not_found", "item": None}


@pytest.mark.spec("F-011-03", "F-011-04", "F-011-05", "F-011-06")
def test_net_content_from_product_quantity() -> None:
    d = found("net-quantity-g")
    assert d["name"] == "カップ麺（しょうゆ味）"  # product_name_ja を優先
    assert d["reference"] == {
        "basis": {"type": "per_100g", "amount": 100, "unit": "g", "label": None},
        "net_content": {"status": "known", "amount": 78, "unit": "g", "pieces": None},
        "nutrients": {"energy_kcal": 450, "protein_g": 12.6, "fat_g": 18.7, "carbohydrate_g": 57.4},
    }


@pytest.mark.spec("F-011-04", "F-011-05", "F-011-06")
def test_net_content_from_quantity_text_in_liters() -> None:
    d = found("quantity-text-liter")
    assert d["name"] == "Oolong tea"  # 日本語名がなければ product_name
    assert d["reference"]["basis"] == {"type": "per_100ml", "amount": 100, "unit": "ml", "label": None}
    assert d["reference"]["net_content"] == {"status": "known", "amount": 1500, "unit": "ml", "pieces": None}


@pytest.mark.spec("F-011-05")
def test_net_content_assumed_from_serving() -> None:
    d = found("serving-only")
    assert d["reference"]["net_content"] == {
        "status": "assumed_from_serving",
        "amount": 60,
        "unit": "g",
        "pieces": None,
    }
    assert d["reference"]["basis"]["type"] == "per_100g"


@pytest.mark.spec("F-011-02", "F-011-03", "F-011-05")
def test_kj_only_and_unknown_net_content() -> None:
    d = found("no-quantity-kj-only")
    assert d["reference"]["nutrients"] == {
        "energy_kcal": 68.0,
        "protein_g": 1.1,
        "fat_g": None,
        "carbohydrate_g": 15.6,  # 284.5 kJ ÷ 4.184 = 68.0
    }
    assert d["reference"]["net_content"] == {"status": "unknown", "amount": None, "unit": None, "pieces": None}


@pytest.mark.spec("F-011-02", "F-011-04")
def test_energy_field_is_kj_and_numbers_as_text() -> None:
    d = found("energy-only-in-energy-field")
    assert d["name"] == "名称不明の商品"  # 名前が空
    assert d["reference"]["nutrients"]["energy_kcal"] == 250.0  # 1046 kJ ÷ 4.184 = 250.0
    assert d["reference"]["nutrients"]["protein_g"] == 3.2  # 文字列の数値も読む
