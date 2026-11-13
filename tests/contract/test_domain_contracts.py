"""ドメイン契約（contracts/domain）の契約テスト。

roadmap DAT-01 / TST-03。スキーマ・例・ドメインのルール DM-01〜DM-09
（docs/02_design/domain-model.md §6、参照実装は domain_rules.py）を検査する。
"""
import copy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

import domain_rules as dr
from conftest import REPO_ROOT, load_json

DOMAIN_DIR = REPO_ROOT / "contracts" / "domain"
SCHEMAS = sorted(DOMAIN_DIR.glob("*.schema.json"))
VALID = sorted((DOMAIN_DIR / "examples" / "valid").glob("*.json"))
INVALID = sorted((DOMAIN_DIR / "examples" / "invalid").glob("*.json"))
MEAL_SCHEMA = load_json(DOMAIN_DIR / "meal.schema.json")


def rel(p: Path) -> str:
    return p.relative_to(DOMAIN_DIR).as_posix()


def schema_for(example: Path) -> dict:
    # 例ファイル名の先頭（meal-*.json → meal.schema.json）でスキーマを選ぶ
    return load_json(DOMAIN_DIR / f"{example.name.split('-', 1)[0]}.schema.json")


def validator(schema: dict) -> Draft202012Validator:
    return Draft202012Validator(schema, format_checker=FormatChecker())


def test_schemas_and_examples_exist():
    assert SCHEMAS and VALID and INVALID


@pytest.mark.parametrize("path", SCHEMAS, ids=[rel(p) for p in SCHEMAS])
def test_schema_is_valid(path):
    Draft202012Validator.check_schema(load_json(path))


@pytest.mark.parametrize("path", VALID, ids=[rel(p) for p in VALID])
def test_valid_example_validates(path):
    errors = list(validator(schema_for(path)).iter_errors(load_json(path)))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


@pytest.mark.parametrize("path", INVALID, ids=[rel(p) for p in INVALID])
def test_invalid_example_fails(path):
    assert not validator(schema_for(path)).is_valid(load_json(path)), "不適合な例がスキーマに適合してしまっている"


@pytest.mark.spec("DM-01", "DM-02", "DM-03", "DM-04", "DM-05", "DM-06", "DM-07", "DM-08", "DM-09")
@pytest.mark.parametrize("path", VALID, ids=[rel(p) for p in VALID])
def test_valid_example_follows_domain_rules(path):
    errors = dr.meal_errors(load_json(path))
    assert not errors, errors


def test_valid_examples_cover_all_methods_and_modes():
    items = [i for p in VALID for i in load_json(p)["items"]]
    assert {i["source"]["method"] for i in items} == {"barcode", "label_ocr", "photo", "manual"}
    assert {i["portion"]["mode"] for i in items} == {"whole", "fraction", "pieces"}
    statuses = {i["reference"]["net_content"]["status"] for i in items if i["reference"]["net_content"]}
    assert statuses == {"known", "assumed_from_serving", "unknown"}


# ---- ルール自体の確認（計算） ----

@pytest.mark.spec("DM-02", "DM-03")
def test_round1_is_half_up():
    assert dr.round1(0.05) == 0.1 and dr.round1(0.15) == 0.2 and dr.round1(2.25) == 2.3
    assert dr.round1(351.0) == 351.0


@pytest.mark.spec("DM-01")
@pytest.mark.parametrize("eaten_at,expected", [
    ("2026-11-14T03:59:59+09:00", "2026-11-13"),  # 4:00 より前は前日
    ("2026-11-14T04:00:00+09:00", "2026-11-14"),
    ("2026-11-13T23:30:00+09:00", "2026-11-13"),
])
def test_record_date_boundary(eaten_at, expected):
    assert dr.record_date_of(eaten_at) == expected


def _ref(btype, status=None, amount=None, unit=None, pieces=None):
    net = None if status is None else {"status": status, "amount": amount, "unit": unit, "pieces": pieces}
    return {"basis": {"type": btype, "amount": None, "unit": None, "label": None}, "net_content": net,
            "nutrients": {n: 100.0 for n in dr.NUTRIENTS}}


@pytest.mark.spec("DM-04")
@pytest.mark.parametrize("ref,expected", [
    (_ref("per_100g", "known", 76, "g"), 0.76),
    (_ref("per_100g", "assumed_from_serving", 60, "g"), 0.6),
    (_ref("per_100g", "unknown"), 1.0),           # ADR-0009 優先3
    (_ref("per_100ml", "known", 200, "g"), 1.0),  # 単位が合わなければ不明と同じ
    (_ref("per_package", "known", 63, "g"), 1.0),
    (_ref("per_piece", "known", None, None, 4), 4.0),
    (_ref("per_piece", "unknown"), 1.0),
    (_ref("as_estimated"), 1.0),
    (_ref("as_entered"), 1.0),
])
def test_whole_multiplier(ref, expected):
    assert dr.whole_multiplier(ref) == pytest.approx(expected)


@pytest.mark.spec("DM-04", "DM-06")
def test_expected_multiplier_modes():
    ref = _ref("per_100g", "known", 80, "g")
    assert dr.expected_multiplier(ref, {"mode": "fraction", "fraction": 0.25, "pieces": None}) == pytest.approx(0.2)
    piece = _ref("per_piece", "known", None, None, 4)
    assert dr.expected_multiplier(piece, {"mode": "pieces", "fraction": None, "pieces": 2}) == 2.0


# ---- ルールが違反を検出できること（スキーマには適合するが意味が違うデータ） ----

BASE = DOMAIN_DIR / "examples" / "valid" / "meal-photo-plus-barcode.json"
OCR = DOMAIN_DIR / "examples" / "valid" / "meal-label-ocr-columns-and-null.json"
MANUAL = DOMAIN_DIR / "examples" / "valid" / "meal-manual.json"


def _mutations():
    def wrong_record_date(m):
        m["record_date"] = "2026-11-14"

    def wrong_totals(m):
        m["totals"]["energy_kcal"] += 1

    def missing_incomplete(m):
        m["totals_incomplete"] = []

    def wrong_item_value(m):
        m["items"][0]["nutrients"]["protein_g"] = 99

    def wrong_multiplier(m):
        m["items"][3]["portion"]["multiplier"] = 1

    def photo_with_net(m):
        m["items"][0]["reference"]["net_content"] = {"status": "unknown", "amount": None, "unit": None, "pieces": None}

    def barcode_without_code(m):
        m["items"][3]["source"]["product_code"] = None

    def photo_without_estimation(m):
        m["items"][0]["source"]["estimation"] = None

    def pieces_on_non_piece(m):
        m["items"][1]["portion"].update(mode="pieces", pieces=1)

    def duplicate_item_id(m):
        m["items"][1]["item_id"] = m["items"][0]["item_id"]

    def manual_fraction(m):
        m["items"][0]["source"] = {"method": "manual", "provider": "user", "product_code": None, "estimation": None,
                                   "confidence": None, "column_index": None, "column_heading": None}
        m["items"][0]["reference"]["basis"]["type"] = "as_entered"
        m["items"][0]["estimate_detail"] = None
        m["items"][0]["portion"].update(mode="fraction", fraction=0.5, multiplier=0.5)

    def manual_with_null(m):
        m["items"][0]["reference"]["nutrients"]["fat_g"] = None
        m["items"][0]["nutrients"]["fat_g"] = None
        m["totals"], m["totals_incomplete"] = dr.totals_of(m["items"])

    return [
        ("DM-09", MANUAL, manual_with_null),
        ("DM-01", BASE, wrong_record_date),
        ("DM-02", BASE, wrong_totals),
        ("DM-02", OCR, missing_incomplete),
        ("DM-03", BASE, wrong_item_value),
        ("DM-04", BASE, wrong_multiplier),
        ("DM-05", BASE, photo_with_net),
        ("DM-05", BASE, barcode_without_code),
        ("DM-05", BASE, photo_without_estimation),
        ("DM-06", BASE, pieces_on_non_piece),
        ("DM-07", BASE, duplicate_item_id),
        ("DM-06", BASE, manual_fraction),
    ]


@pytest.mark.parametrize("rule,path,mutate", [
    pytest.param(r, p, m, marks=pytest.mark.spec(r), id=f"{r}-{m.__name__}") for r, p, m in _mutations()
])
def test_domain_rules_detect_violations(rule, path, mutate):
    meal = copy.deepcopy(load_json(path))
    mutate(meal)
    assert validator(MEAL_SCHEMA).is_valid(meal), "スキーマ違反ではなく、ルール違反だけを作る"
    errors = dr.meal_errors(meal)
    assert any(e.startswith(rule) or f" {rule}:" in e for e in errors), errors


@pytest.mark.spec("DM-08")
def test_empty_meal_is_detected():
    """食品が0件の食事（スキーマの minItems でも弾くが、ルールの参照実装でも検出する）。"""
    meal = copy.deepcopy(load_json(BASE))
    meal["items"] = []
    meal["totals"], meal["totals_incomplete"] = dr.totals_of([])
    assert any(e.startswith("DM-08") for e in dr.meal_errors(meal))
