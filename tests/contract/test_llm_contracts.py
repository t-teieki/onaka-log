"""Claude API 契約（contracts/llm）の契約テスト。

roadmap TST-03 / ADR-0001 の実装。スキーマ・例・Structured Outputs 互換・
README に書かれた意味上のルールを検査する。
"""
import re

import pytest
from jsonschema import Draft202012Validator

from conftest import (
    LLM_DIR, check_structured_outputs, example_files, load_json, rel,
    schema_for, usecase_dirs,
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
    data = load_json(path)
    usecase = path.parents[2].name
    if usecase in ("food-photo-estimate", "text-estimate"):
        if data["status"] != "ok":
            assert data["items"] == []
            assert data["meal_name"] is None
    elif usecase == "nutrition-label-ocr":
        if data["status"] == "ok":
            assert data["nutrients"]["energy_kcal"] is not None
            assert data["basis"]["type"] != "unknown"
    else:
        pytest.fail(f"意味ルール未定義の用途: {usecase}")
