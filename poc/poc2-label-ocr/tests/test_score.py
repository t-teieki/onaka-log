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


def col(kcal=345, p=4.9, f=20.5, c=35.0, heading=None, basis=None):
    return {
        "heading": heading,
        "basis": basis or {"type": "per_package", "amount": 63, "unit": "g", "label_text": "1箱(63g)当たり"},
        "nutrients": {"energy_kcal": kcal, "protein_g": p, "fat_g": f, "carbohydrate_g": c, "salt_equivalent_g": 0.3},
    }


def pred(**kw):
    base = {
        "status": "ok", "product_name": None,
        "net_content": {"amount": 63, "unit": "g", "pieces": None, "label_text": None},
        "columns": [col()],
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
    p["columns"][0]["nutrients"]["protein_g"] = 4.95  # 差 0.05 は許容
    assert sc.score_one(p, truth(), SCHEMA)["nutrients"]["protein_g"] is True
    p["columns"][0]["nutrients"]["protein_g"] = 5.0  # 差 0.1 は不正解
    s = sc.score_one(p, truth(), SCHEMA)
    assert s["nutrients"]["protein_g"] is False and s["all4_correct"] is False


def test_null_prediction_is_incorrect():
    p = pred()
    p["columns"][0]["nutrients"]["fat_g"] = None
    assert sc.score_one(p, truth(), SCHEMA)["nutrients"]["fat_g"] is False


def test_basis_per_package_equivalents():
    for t in ("per_package", "per_serving", "per_piece"):
        p = pred()
        p["columns"][0]["basis"]["type"] = t
        s = sc.score_one(p, truth(), SCHEMA)
        assert s["basis_correct"] is True and s["pred_basis_type"] == t
    p = pred()
    p["columns"][0]["basis"]["type"] = "per_100g"
    assert sc.score_one(p, truth(), SCHEMA)["basis_correct"] is False


def test_basis_per_100g_must_match_exactly():
    t = truth(basis="per_100g", basis_amount=100.0)
    p = pred()
    p["columns"][0]["basis"].update(type="per_100g", amount=100)
    assert sc.score_one(p, t, SCHEMA)["basis_correct"] is True
    p["columns"][0]["basis"]["type"] = "per_serving"
    assert sc.score_one(p, t, SCHEMA)["basis_correct"] is False


def test_basis_amount_and_unit():
    p = pred()
    p["columns"][0]["basis"]["amount"] = 64
    assert sc.score_one(p, truth(), SCHEMA)["basis_correct"] is False
    p = pred()
    p["columns"][0]["basis"]["unit"] = "ml"
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
    p["columns"][0]["nutrients"]["energy_kcal"] = None
    assert sc.semantic_ok(p) is False
    assert sc.semantic_ok(pred(status="unreadable")) is False  # ok 以外で columns が空でない
    assert sc.semantic_ok(pred(status="unreadable", columns=[])) is True
    assert sc.semantic_ok(pred(columns=[])) is False  # ok なのに列がない
    assert sc.semantic_ok(pred(columns=[col(), col()])) is False  # 複数列なのに multiple_labels なし
    assert sc.semantic_ok(pred(columns=[col(), col()], issues=["multiple_labels"])) is True
    piece = {"type": "per_piece", "amount": 1, "unit": None, "label_text": "1個当たり"}
    assert sc.semantic_ok(pred(columns=[col(basis=piece)])) is False  # per_piece で amount が null でない
    piece["amount"] = None
    assert sc.semantic_ok(pred(columns=[col(basis=piece)])) is True
    assert sc.semantic_ok({}) is False  # 例外を出さない


def test_multiple_columns_scores_best_matching_column():
    # 味違いの2列: 利用者が正しい列を選ぶ想定なので、正解に合う列で採点する
    p = pred(columns=[col(250, 1.5, 22.7, 10.0, "シュガー"), col(289, 1.7, 26.1, 11.7, "チョコ")],
             issues=["multiple_labels"])
    sugar = truth(energy_kcal=250.0, protein_g=1.5, fat_g=22.7, carbohydrate_g=10.0)
    choco = truth(energy_kcal=289.0, protein_g=1.7, fat_g=26.1, carbohydrate_g=11.7)
    s = sc.score_one(p, sugar, SCHEMA)
    assert s["all4_correct"] and s["column_index"] == 0 and s["n_columns"] == 2
    s = sc.score_one(p, choco, SCHEMA)
    assert s["all4_correct"] and s["column_index"] == 1
    assert s["schema_valid"] and s["semantic_ok"]


def test_no_columns_is_incorrect():
    s = sc.score_one(pred(status="unreadable", columns=[]), truth(), SCHEMA)
    assert s["all4_correct"] is False and s["basis_correct"] is False and s["column_index"] is None


def test_per_piece_without_amount_matches_blank_truth():
    # 「1個当たり」: 正解 CSV は basis_amount・basis_unit が空欄
    piece = {"type": "per_piece", "amount": None, "unit": None, "label_text": "1個当たり"}
    t = truth(basis="per_serving", basis_amount=None, basis_unit="")
    assert sc.score_one(pred(columns=[col(basis=piece)]), t, SCHEMA)["basis_correct"] is True


def test_v02_output_is_read_as_one_column():
    # 過去の results.jsonl（v0.2）の集計用
    old = {"status": "ok", "basis": col()["basis"], "nutrients": col()["nutrients"]}
    assert sc.columns_of(old) == [{"heading": None, "basis": old["basis"], "nutrients": old["nutrients"]}]
    assert sc.score_one(old, truth())["all4_correct"] is True


def test_schema_invalid_detected():
    p = pred()
    p["columns"][0]["nutrients"]["energy_kcal"] = -1  # minimum 違反（完全版スキーマでだけ検出）
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
