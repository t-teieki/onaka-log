import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import evaluate as ev  # noqa: E402


def truth(**kw):
    base = {
        "sample_id": "T1", "jan": "1", "basis": "per_package", "basis_amount": 200.0,
        "basis_unit": "g", "net_content": 200.0, "net_content_unit": "g",
        "energy_kcal": 200.0, "protein_g": 10.0, "fat_g": 5.0, "carbohydrate_g": 30.0,
    }
    base.update(kw)
    return base


def payload(nutriments=None, per="100g", **product):
    nut = {"energy-kcal_100g": 100, "proteins_100g": 5, "fat_100g": 2.5, "carbohydrates_100g": 15}
    if nutriments is not None:
        nut = nutriments
    p = {"product_name": "X", "nutrition_data_per": per, "nutriments": nut}
    p.update(product)
    return {"status": 1, "product": p}


def test_not_found():
    r = ev.evaluate_sample(truth(), {"status": 0, "status_verbose": "product not found"})
    assert r["found"] is False and not r["comparable"] and "not_found" in r["reasons"]


def test_per_package_conversion_uses_truth_amount_not_off_quantity():
    # OFF の内容量は 999g だが、換算は正解の basis_amount(200) を使う
    r = ev.evaluate_sample(truth(), payload(product_quantity=999, product_quantity_unit="g"))
    assert r["converted"]["energy_kcal"] == pytest.approx(200)
    assert r["converted"]["protein_g"] == pytest.approx(10)
    assert r["all4_match"] is True
    assert r["has_net_content"] is True


def test_per_100g_direct_compare():
    t = truth(basis="per_100g", basis_amount=100.0, energy_kcal=100.0, protein_g=5.0,
              fat_g=2.5, carbohydrate_g=15.0)
    r = ev.evaluate_sample(t, payload())
    assert r["converted"]["energy_kcal"] == pytest.approx(100)
    assert r["all4_match"] is True


def test_per_100ml_direct_compare_and_density_flag():
    t = truth(basis="per_100ml", basis_amount=100.0, basis_unit="ml", energy_kcal=100.0,
              protein_g=5.0, fat_g=2.5, carbohydrate_g=15.0)
    r = ev.evaluate_sample(t, payload())
    assert r["flags"]["unit_assumed_density_1"] is True
    assert r["all4_match"] is True


def test_ml_truth_with_100g_off_sets_density_flag_and_g_does_not():
    assert ev.evaluate_sample(truth(basis_unit="ml"), payload())["flags"]["unit_assumed_density_1"]
    assert not ev.evaluate_sample(truth(), payload())["flags"]["unit_assumed_density_1"]


def test_g_truth_with_100ml_off_sets_density_flag():
    r = ev.evaluate_sample(truth(), payload(per="100ml"))
    assert r["flags"]["unit_assumed_density_1"] is True


def test_kj_only_conversion():
    nut = {"energy-kj_100g": 418.4, "proteins_100g": 5, "fat_100g": 2.5, "carbohydrates_100g": 15}
    r = ev.evaluate_sample(truth(), payload(nut))
    assert r["flags"]["energy_from_kj"] is True
    assert r["converted"]["energy_kcal"] == pytest.approx(200)  # 100kcal * 2
    assert r["has_all4_100g"] is True


def test_kj_via_energy_100g_key():
    nut = {"energy_100g": 418.4, "proteins_100g": 5, "fat_100g": 2.5, "carbohydrates_100g": 15}
    assert ev.extract_off(payload(nut))["per100"]["energy_kcal"] == pytest.approx(100)


def test_serving_only_not_comparable():
    nut = {"energy-kcal_serving": 200, "proteins_serving": 10, "fat_serving": 5,
           "carbohydrates_serving": 30}
    r = ev.evaluate_sample(truth(), payload(nut, per="serving"))
    assert r["found"] and not r["comparable"] and r["has_all4_100g"] is False
    assert "serving_only" in r["reasons"]


def test_missing_nutrient():
    nut = {"energy-kcal_100g": 100, "proteins_100g": 5, "fat_100g": 2.5}
    r = ev.evaluate_sample(truth(), payload(nut))
    assert not r["comparable"] and "nutrients_missing" in r["reasons"]


@pytest.mark.parametrize("nutrient,truth_v,off_v,expected", [
    ("energy_kcal", 200, 210, True),      # ちょうど 5%
    ("energy_kcal", 200, 210.01, False),
    ("energy_kcal", 200, 190, True),
    ("energy_kcal", 50, 55, True),        # 5 kcal の下限（5% は 2.5）
    ("energy_kcal", 50, 55.01, False),
    ("protein_g", 5, 5.5, True),          # 0.5 g の下限
    ("protein_g", 5, 5.51, False),
    ("fat_g", 20, 21, True),              # 5% = 1.0
    ("fat_g", 20, 21.01, False),
    ("carbohydrate_g", 0.4, 0.9, True),
    ("carbohydrate_g", 0.4, 0.91, False),
])
def test_tolerance_edges(nutrient, truth_v, off_v, expected):
    assert ev.is_match(nutrient, truth_v, off_v) is expected


def test_mismatch_reports_diff():
    nut = {"energy-kcal_100g": 150, "proteins_100g": 5, "fat_100g": 2.5, "carbohydrates_100g": 15}
    r = ev.evaluate_sample(truth(), payload(nut))
    e = r["nutrients"]["energy_kcal"]
    assert e["match"] is False and e["diff"] == pytest.approx(100) and e["rel_diff"] == pytest.approx(0.5)
    assert r["all4_match"] is False


def test_net_content_from_quantity_string_and_missing():
    assert ev.extract_off(payload(quantity="1.5 L"))["off_net_content"]["value"] == 1500
    assert ev.extract_off(payload())["off_net_content"] is None
    r = ev.evaluate_sample(truth(), payload())
    assert r["has_net_content"] is False


def test_aggregate_hold_small_sample_and_rates():
    rs = [ev.evaluate_sample(truth(), payload()),
          ev.evaluate_sample(truth(), {"status": 0})]
    m = ev.aggregate(rs)
    assert m["found_rate"] == 0.5 and m["all4_rate"] == 1.0
    assert m["verdict"] == "hold"
    assert m["per_breakdown"] == {"100g": 1}
    assert m["nutrient_match"]["energy_kcal"]["total"] == 1


def test_aggregate_verdicts_with_enough_samples():
    ok = ev.evaluate_sample(truth(), payload())
    nf = ev.evaluate_sample(truth(), {"status": 0})
    assert ev.aggregate([ok] * 10 + [nf] * 10)["verdict"] == "adopt"
    assert ev.aggregate([ok] * 3 + [nf] * 17)["verdict"] == "demote"
    assert ev.aggregate([ok] * 6 + [nf] * 14)["verdict"] == "consult"
