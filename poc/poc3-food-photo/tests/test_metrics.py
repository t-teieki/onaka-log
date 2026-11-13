import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parents[3] / "poc"))

import metrics as mt  # noqa: E402
import run  # noqa: E402
from shared import schemas  # noqa: E402

SCHEMA = schemas.load_schema("food-photo-estimate")


def item(name="ご飯", kcal=234, p=3.8, f=0.5, c=53.4, w=150):
    return {"name": name, "amount": {"value": 1, "unit": "bowl"}, "estimated_weight_g": w,
            "nutrients": {"energy_kcal": kcal, "protein_g": p, "fat_g": f, "carbohydrate_g": c},
            "confidence": "medium"}


def pred(items=None, **kw):
    base = {"status": "ok", "meal_name": "定食", "items": [item()] if items is None else items,
            "assumptions": [], "notes": None}
    base.update(kw)
    return base


def test_valid_pred_fixture():
    assert mt.validate_output(pred(), SCHEMA) == []
    assert mt.semantic_errors(pred()) == []


def test_semantic_errors():
    assert mt.semantic_errors(pred(status="not_food", items=[], meal_name=None)) == []
    assert mt.semantic_errors(pred(status="not_food"))  # items と meal_name が残っている
    assert mt.semantic_errors(pred(items=[]))  # ok なのに品目なし
    assert mt.semantic_errors({}) == ["出力の形がスキーマと違う"]


def test_totals_sums_items():
    t = mt.totals(pred([item(kcal=200, p=10, f=5, c=20), item(kcal=50, p=1, f=1, c=8)]))
    assert t == {"energy_kcal": 250, "protein_g": 11, "fat_g": 6, "carbohydrate_g": 28}
    assert mt.totals(pred(status="not_food", items=[], meal_name=None)) is None
    assert mt.totals(None) is None


def test_atwater():
    # ご飯 150g: 4*3.8 + 9*0.5 + 4*53.4 = 233.3 ≒ 234
    assert mt.atwater_ratio(item()["nutrients"]) == pytest.approx(233.3 / 234)
    assert mt.atwater_checks(pred()) == [True]
    bad = item(kcal=500, p=10, f=5, c=20)  # 計算値 165 → 比 0.33
    assert mt.atwater_checks(pred([bad])) == [False]
    tea = item(name="お茶", kcal=2, p=0, f=0, c=0.3)  # 小さい品目は対象外
    assert mt.atwater_ratio(tea["nutrients"]) is None
    assert mt.atwater_checks(pred([tea])) == []


def test_cv():
    assert mt.cv([100, 100, 100]) == 0
    assert mt.cv([90, 100, 110]) == pytest.approx(0.1)
    assert mt.cv([100]) is None
    assert mt.cv([0, 0]) is None


def test_rel_diff():
    assert mt.rel_diff(110, 100) == pytest.approx(0.1)
    assert mt.rel_diff(None, 100) is None and mt.rel_diff(1, 0) is None


def test_parse_configs():
    assert run.parse_configs("claude-haiku-5-5:low, claude-opus-5-5:medium") == [
        ("claude-haiku-5-5", "low"), ("claude-opus-5-5", "medium")]
    with pytest.raises(ValueError):
        run.parse_configs("gpt:low")
    with pytest.raises(ValueError):
        run.parse_configs("claude-haiku-5-5:max")


def test_group_stats_and_summary():
    rows = []
    for rep, kcal in enumerate([90, 100, 110], 1):
        rows.append({"sample_id": "P001", "model": "claude-haiku-5-5", "effort": "low", "size": "1024",
                     "rep": rep, "parsed": pred([item(kcal=kcal, p=2, f=1, c=kcal / 4 - 2.5)]),
                     "error": None, "schema_errors": [], "semantic_errors": [],
                     "latency_s": 3.0, "cost_jpy": 0.1, "prompt_version": "0.1.0", "schema_id": "x"})
    g = run.group_stats(rows)
    assert g["mean_energy_kcal"] == pytest.approx(100) and g["cv_energy_kcal"] == pytest.approx(0.1)
    assert g["items_min"] == g["items_max"] == 1
    md = run.build_summary(rows, {"P001": {"notes": "テスト"}})
    assert "P001 テスト" in md and "3/3 (100%)" in md and "10.0%" in md
    assert run.build_summary([], {}).endswith("結果なし。\n")


def test_latest_runs_keeps_last():
    a = {"sample_id": "P1", "model": "m", "effort": "low", "size": "1024", "rep": 1, "v": 1}
    b = dict(a, v=2)
    assert run.latest_runs([a, b]) == [b]
