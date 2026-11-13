import copy
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parents[3] / "poc"))

import score as sc  # noqa: E402
from shared import schemas  # noqa: E402

SCHEMA = schemas.load_schema("nutrition-label-ocr")


def truth(**kw):
    base = {
        "sample_id": "T1", "basis": "per_package", "basis_amount": 63.0, "basis_unit": "g",
        "net_content": 63.0, "net_content_unit": "g",
        "energy_kcal": 345.0, "protein_g": 4.9, "fat_g": 20.5, "carbohydrate_g": 35.0,
        "expected_status": "ok",
    }
    base.update(kw)
    return base


def pred(**kw):
    base = {
        "status": "ok", "product_name": None,
        "basis": {"type": "per_package", "amount": 63, "unit": "g", "label_text": "1箱(63g)当たり"},
        "net_content": {"amount": 63, "unit": "g", "pieces": None, "label_text": None},
        "nutrients": {"energy_kcal": 345, "protein_g": 4.9, "fat_g": 20.5, "carbohydrate_g": 35.0, "salt_equivalent_g": 0.3},
        "confidence": "high", "issues": [], "notes": None,
    }
    base.update(kw)
    return base


def test_all_correct():
    s = sc.score_one(pred(), truth(), SCHEMA)
    assert s["status_ok"] and s["all4_correct"] and s["basis_correct"] and s["net_content_correct"]
    assert s["schema_valid"] and s["semantic_ok"]


def test_nutrient_tolerance_boundary():
    p = pred()
    p["nutrients"]["protein_g"] = 4.95  # 差 0.05 は許容
    assert sc.score_one(p, truth(), SCHEMA)["nutrients"]["protein_g"] is True
    p["nutrients"]["protein_g"] = 5.0  # 差 0.1 は不正解
    s = sc.score_one(p, truth(), SCHEMA)
    assert s["nutrients"]["protein_g"] is False and s["all4_correct"] is False


def test_null_prediction_is_incorrect():
    p = pred()
    p["nutrients"]["fat_g"] = None
    assert sc.score_one(p, truth(), SCHEMA)["nutrients"]["fat_g"] is False


def test_basis_per_package_equivalents():
    for t in ("per_package", "per_serving", "per_piece"):
        p = pred()
        p["basis"]["type"] = t
        s = sc.score_one(p, truth(), SCHEMA)
        assert s["basis_correct"] is True and s["pred_basis_type"] == t
    p = pred()
    p["basis"]["type"] = "per_100g"
    assert sc.score_one(p, truth(), SCHEMA)["basis_correct"] is False


def test_basis_per_100g_must_match_exactly():
    t = truth(basis="per_100g", basis_amount=100.0)
    p = pred()
    p["basis"].update(type="per_100g", amount=100)
    assert sc.score_one(p, t, SCHEMA)["basis_correct"] is True
    p["basis"]["type"] = "per_serving"
    assert sc.score_one(p, t, SCHEMA)["basis_correct"] is False


def test_basis_amount_and_unit():
    p = pred()
    p["basis"]["amount"] = 64
    assert sc.score_one(p, truth(), SCHEMA)["basis_correct"] is False
    p = pred()
    p["basis"]["unit"] = "ml"
    assert sc.score_one(p, truth(), SCHEMA)["basis_correct"] is False


def test_net_content():
    p = pred()
    p["net_content"]["amount"] = None
    assert sc.score_one(p, truth(), SCHEMA)["net_content_correct"] is False
    p = pred()
    p["net_content"]["unit"] = "ml"
    assert sc.score_one(p, truth(), SCHEMA)["net_content_correct"] is False
    # 正解に内容量がなければ対象外
    assert sc.score_one(pred(), truth(net_content=None), SCHEMA)["net_content_correct"] is None


def test_status_mismatch_and_non_ok_expected():
    p = pred(status="unreadable")
    s = sc.score_one(p, truth(), SCHEMA)
    assert s["status_ok"] is False
    t = truth(expected_status="unreadable")
    s = sc.score_one(p, t, SCHEMA)
    assert s["status_ok"] is True
    assert s["all4_correct"] is None and s["basis_correct"] is None and s["nutrients"]["energy_kcal"] is None


def test_semantic_rule():
    assert sc.semantic_ok(pred()) is True
    p = pred()
    p["nutrients"]["energy_kcal"] = None
    assert sc.semantic_ok(p) is False
    p = pred()
    p["basis"]["type"] = "unknown"
    assert sc.semantic_ok(p) is False
    assert sc.semantic_ok(pred(status="unreadable")) is True
    sc.semantic_ok({})  # 例外を出さない


def test_schema_invalid_detected():
    p = pred()
    p["nutrients"]["energy_kcal"] = -1  # minimum 違反（完全版スキーマでだけ検出）
    s = sc.score_one(p, truth(), SCHEMA)
    assert s["schema_valid"] is False and s["schema_errors"]
    p = copy.deepcopy(pred())
    del p["confidence"]
    assert sc.score_one(p, truth(), SCHEMA)["schema_valid"] is False


def test_score_error_all_incorrect():
    s = sc.score_error(truth())
    assert s["status_ok"] is False and s["all4_correct"] is False and s["schema_valid"] is False
    assert all(v is False for v in s["nutrients"].values())
    s = sc.score_error(truth(expected_status="unreadable"))
    assert s["all4_correct"] is None
