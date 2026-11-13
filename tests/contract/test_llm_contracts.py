"""Claude API 契約（contracts/llm）の契約テスト。

roadmap TST-03 / ADR-0001 の実装。スキーマ・例・Structured Outputs 互換・
README に書かれた意味上のルールを検査する。
"""
import re

import pytest
from jsonschema import Draft202012Validator

from conftest import (
    LLM_DIR, check_structured_outputs, example_files, load_json, rel,
    schema_for, semantic_errors, usecase_dirs,
)

USECASES = usecase_dirs()
USECASE_IDS = [d.name for d in USECASES]
ALL_SCHEMAS = sorted(LLM_DIR.glob("*/*.schema.json"))
VALID = example_files("valid", "input") + example_files("valid", "output")
INVALID = example_files("invalid", "input") + example_files("invalid", "output")
VALID_OUTPUTS = example_files("valid", "output")


def test_usecases_exist():
    assert USECASES, "contracts/llm 配下に output.schema.json を持つ用途がない"


@pytest.mark.parametrize("d", USECASES, ids=USECASE_IDS)
def test_usecase_has_required_files(d):
    assert (d / "input.schema.json").is_file()
    assert (d / "prompt.md").is_file()
    text = (d / "prompt.md").read_text(encoding="utf-8")
    assert re.search(r"prompt_version: \d+\.\d+\.\d+", text)


@pytest.mark.parametrize("path", ALL_SCHEMAS, ids=[rel(p) for p in ALL_SCHEMAS])
def test_schema_is_valid(path):
    Draft202012Validator.check_schema(load_json(path))


@pytest.mark.parametrize("path", VALID, ids=[rel(p) for p in VALID])
def test_valid_example_validates(path):
    errors = list(Draft202012Validator(schema_for(path)).iter_errors(load_json(path)))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


@pytest.mark.parametrize("path", INVALID, ids=[rel(p) for p in INVALID])
def test_invalid_example_fails(path):
    validator = Draft202012Validator(schema_for(path))
    assert not validator.is_valid(load_json(path)), "不適合な例がスキーマに適合してしまっている"


@pytest.mark.parametrize("d", USECASES, ids=USECASE_IDS)
@pytest.mark.parametrize("kind", ["valid", "invalid"])
@pytest.mark.parametrize("prefix", ["input", "output"])
def test_usecase_has_examples(d, kind, prefix):
    assert list((d / "examples" / kind).glob(f"{prefix}-*.json")), f"{kind}/{prefix}-*.json がない"


@pytest.mark.parametrize("d", USECASES, ids=USECASE_IDS)
def test_output_schema_structured_outputs_compatible(d):
    errors = check_structured_outputs(load_json(d / "output.schema.json"))
    assert not errors, errors


def test_structured_outputs_check_detects_violations():
    bad = {
        "type": "object",
        "properties": {"a": {"type": "string", "pattern": "x"}, "b": {"$ref": "#/$defs/n"}},
        "required": ["a"],
        "$defs": {"n": {"type": "object", "additionalProperties": False,
                        "properties": {"c": {"$ref": "#/$defs/n"}}, "required": ["c"]}},
    }
    errors = "\n".join(check_structured_outputs(bad))
    nullable_enum = {"type": "object", "additionalProperties": False, "required": ["u"],
                     "properties": {"u": {"type": ["string", "null"], "enum": ["g", None]}}}
    assert "enum" in "\n".join(check_structured_outputs(nullable_enum))
    assert "additionalProperties" in errors
    assert "required" in errors
    assert "pattern" in errors
    assert "再帰" in errors
    good = {"type": "object", "additionalProperties": False,
            "properties": {"a": {"type": ["string", "null"]}}, "required": ["a"]}
    assert check_structured_outputs(good) == []


@pytest.mark.parametrize("path", VALID_OUTPUTS, ids=[rel(p) for p in VALID_OUTPUTS])
def test_semantic_rules(path):
    errors = semantic_errors(path.parents[2].name, load_json(path))
    assert not errors, errors


OCR_OK = LLM_DIR / "nutrition-label-ocr" / "examples" / "valid" / "output-ok-per-package.json"
OCR_MULTI = LLM_DIR / "nutrition-label-ocr" / "examples" / "valid" / "output-ok-multiple-columns.json"


def _ocr_mutations():
    """スキーマには適合するが、意味上のルールに違反する OCR 出力（ルール, 変更）の組。"""
    def ok_without_columns(d):
        d["columns"] = []

    def ok_null_kcal(d):
        d["columns"][0]["nutrients"]["energy_kcal"] = None

    def unreadable_with_columns(d):
        d["status"] = "unreadable"

    def multi_without_issue(d):
        d["issues"] = []

    def per_piece_with_amount(d):
        d["columns"][0]["basis"]["amount"] = 1

    return [
        ("columns が空", OCR_OK, ok_without_columns),
        ("energy_kcal が null", OCR_OK, ok_null_kcal),
        ("columns が空でない", OCR_OK, unreadable_with_columns),
        ("multiple_labels", OCR_MULTI, multi_without_issue),
        ("per_piece", OCR_MULTI, per_piece_with_amount),
    ]


@pytest.mark.parametrize("expected,path,mutate", _ocr_mutations(),
                         ids=[m[0] for m in _ocr_mutations()])
def test_ocr_semantic_rules_detect_violations(expected, path, mutate):
    data = load_json(path)
    mutate(data)
    schema = load_json(path.parents[2] / "output.schema.json")
    assert Draft202012Validator(schema).is_valid(data), "スキーマ違反ではなく意味上の違反だけを作る"
    errors = semantic_errors("nutrition-label-ocr", data)
    assert any(expected in e for e in errors), errors
