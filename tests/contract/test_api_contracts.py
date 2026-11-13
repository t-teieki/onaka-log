"""API 契約（contracts/api/openapi.yaml）の契約テスト。

roadmap TST-03 / ARC-04。OpenAPI としての正しさ、例ファイルの適合・不適合、
API のルール（docs/02_design/api.md、参照実装 api_rules.py）とドメインのルールを検査する。
"""
import copy
import json
import re
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator
from openapi_spec_validator import validate as validate_openapi
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

import api_rules as ar
import domain_rules as dr
from conftest import REPO_ROOT, load_json

API_DIR = REPO_ROOT / "contracts" / "api"
OPENAPI_PATH = API_DIR / "openapi.yaml"
OPENAPI_URI = OPENAPI_PATH.as_uri()
SPEC = yaml.safe_load(OPENAPI_PATH.read_text(encoding="utf-8"))
COMPONENTS = SPEC["components"]["schemas"]
VALID = sorted((API_DIR / "examples" / "valid").glob("*.json"))
INVALID = sorted((API_DIR / "examples" / "invalid").glob("*.json"))
MEAL_SCHEMA = load_json(REPO_ROOT / "contracts" / "domain" / "meal.schema.json")
OPERATIONS = [
    (path, method, op)
    for path, item in SPEC["paths"].items()
    for method, op in item.items()
    if method in ("get", "post", "put", "patch", "delete")
]


def _registry() -> Registry:
    """OpenAPI と、そこから参照する contracts のスキーマを、ファイルの URI と $id の両方で引けるようにする。"""
    resources = [(OPENAPI_URI, Resource(contents=SPEC, specification=DRAFT202012))]
    for path in list((REPO_ROOT / "contracts").glob("*/*.schema.json")) + list(
            (REPO_ROOT / "contracts" / "llm").glob("*/*.schema.json")):
        contents = load_json(path)
        res = Resource(contents=contents, specification=DRAFT202012)
        resources.append((path.as_uri(), res))
        if "$id" in contents:
            resources.append((contents["$id"], res))
    return Registry().with_resources(resources)


REGISTRY = _registry()


def validator_for(component: str) -> Draft202012Validator:
    return Draft202012Validator({"$ref": f"{OPENAPI_URI}#/components/schemas/{component}"}, registry=REGISTRY)


def component_of(example: Path) -> str:
    return example.name.split("-", 1)[0]


def rel(p: Path) -> str:
    return p.relative_to(API_DIR).as_posix()


# ---- OpenAPI としての正しさ ----

def test_openapi_document_is_valid():
    validate_openapi(SPEC, base_uri=OPENAPI_URI)


def test_examples_exist():
    assert VALID and INVALID


def test_paths_are_versioned():
    assert all(p.startswith("/v1/") for p in SPEC["paths"])


def test_operation_ids_are_unique():
    ids = [op["operationId"] for _, _, op in OPERATIONS]
    assert len(ids) == len(set(ids))


@pytest.mark.spec("F-001")
@pytest.mark.parametrize("path,method,op", OPERATIONS, ids=[f"{m.upper()} {p}" for p, m, _ in OPERATIONS])
def test_operation_has_auth_and_error_responses(path, method, op):
    assert SPEC["security"] == [{"cognitoJwt": []}] and "security" not in op, "全 API が JWT 必須"
    responses = op["responses"]
    assert "401" in responses and "500" in responses
    for code, resp in responses.items():
        if code.startswith(("4", "5")):
            assert resp["$ref"].startswith("#/components/responses/"), f"{code} は共通のエラー応答を使う"


def test_error_responses_use_error_schema():
    for name, resp in SPEC["components"]["responses"].items():
        assert resp["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Error"}, name


def test_error_codes_match_api_doc():
    """api.md §5 の表の code と、Error スキーマの enum が一致する。"""
    doc = (REPO_ROOT / "docs" / "02_design" / "api.md").read_text(encoding="utf-8")
    section = doc.split("## 5.")[1].split("## 6.")[0]
    documented = set(re.findall(r"^\| \d{3} \| `([a-z_]+)` \|", section, re.M))
    enum = set(COMPONENTS["Error"]["properties"]["error"]["properties"]["code"]["enum"])
    assert documented == enum


# ---- 例ファイル ----

@pytest.mark.parametrize("path", VALID + INVALID, ids=[rel(p) for p in VALID + INVALID])
def test_example_names_a_component(path):
    assert component_of(path) in COMPONENTS, f"{path.name} の先頭が components.schemas の名前でない"


@pytest.mark.parametrize("path", VALID, ids=[rel(p) for p in VALID])
def test_valid_example_validates(path):
    errors = list(validator_for(component_of(path)).iter_errors(load_json(path)))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


@pytest.mark.parametrize("path", INVALID, ids=[rel(p) for p in INVALID])
def test_invalid_example_fails(path):
    assert not validator_for(component_of(path)).is_valid(load_json(path)), "不適合な例がスキーマに適合してしまっている"


def test_request_and_response_components_have_valid_examples():
    referenced = set(re.findall(r"#/components/schemas/(\w+)", json.dumps(SPEC["paths"])))
    covered = {component_of(p) for p in VALID}
    assert referenced - {"Error"} <= covered, referenced - covered


# ---- API のルール（参照実装 api_rules.py） ----

ESTIMATE_KIND = {"LabelEstimateResponse": "label", "PhotoEstimateResponse": "photo", "ProductLookupResponse": "product"}
ESTIMATES = [p for p in VALID if component_of(p) in ESTIMATE_KIND]


@pytest.mark.spec("F-011", "F-012", "F-013")
@pytest.mark.parametrize("path", ESTIMATES, ids=[rel(p) for p in ESTIMATES])
def test_estimate_examples_follow_api_rules(path):
    errors = ar.estimate_errors(ESTIMATE_KIND[component_of(path)], load_json(path))
    assert not errors, errors


CREATES = [p for p in VALID if component_of(p) == "MealCreateRequest"]


@pytest.mark.spec("F-030", "DM-01", "DM-02", "DM-03", "DM-04")
@pytest.mark.parametrize("path", CREATES, ids=[rel(p) for p in CREATES])
def test_create_request_builds_valid_meal(path):
    """保存 API がバックエンドで計算した結果が、食事のスキーマとドメインのルールを満たす。"""
    meal = ar.build_meal(load_json(path), "user-1", "2026-11-13T10:00:00Z")
    assert Draft202012Validator(MEAL_SCHEMA).is_valid(meal)
    assert dr.meal_errors(meal) == []


@pytest.mark.spec("F-030")
def test_add_item_request_builds_valid_meal():
    req = load_json(API_DIR / "examples" / "valid" / "AddItemRequest-barcode-drink.json")
    meal = ar.build_meal(load_json(API_DIR / "examples" / "valid" / "MealCreateRequest-photo.json"), "u", "2026-11-13T10:00:00Z")
    assert req["expected_version"] == meal["version"]
    meal["items"].append(ar.build_item(req["item"]))
    meal["totals"], meal["totals_incomplete"] = dr.totals_of(meal["items"])
    meal["version"] += 1
    assert dr.meal_errors(meal) == []


@pytest.mark.spec("F-031", "F-032")
@pytest.mark.parametrize("path", [p for p in VALID if component_of(p) in ("DaySummary", "DeleteItemResponse")],
                         ids=[rel(p) for p in VALID if component_of(p) in ("DaySummary", "DeleteItemResponse")])
def test_meal_responses_follow_domain_rules(path):
    data = load_json(path)
    if component_of(path) == "DaySummary":
        assert ar.day_errors(data) == []
    else:
        assert data["meal_deleted"] == (data["meal"] is None)
        if data["meal"] is not None:
            assert dr.meal_errors(data["meal"]) == []


@pytest.mark.spec("F-020")
def test_default_portion_rule():
    piece = {"basis": {"type": "per_piece"}, "net_content": {"status": "known", "pieces": 4}}
    assert ar.default_portion(piece) == {"mode": "pieces", "fraction": None, "pieces": 1}
    single = {"basis": {"type": "per_piece"}, "net_content": {"status": "known", "pieces": 1}}
    assert ar.default_portion(single)["mode"] == "whole"
    assert ar.default_portion({"basis": {"type": "as_estimated"}, "net_content": None})["mode"] == "whole"


def test_api_rules_detect_violations():
    label = load_json(API_DIR / "examples" / "valid" / "LabelEstimateResponse-ok-two-columns.json")
    bad = copy.deepcopy(label); bad["candidates"] = []
    assert ar.estimate_errors("label", bad)  # ok なのに候補なし
    bad = copy.deepcopy(label); bad["issues"] = []
    assert ar.estimate_errors("label", bad)  # 複数列なのに multiple_labels なし
    bad = copy.deepcopy(label); bad["candidates"][0]["default_portion"] = {"mode": "whole", "fraction": None, "pieces": None}
    assert ar.estimate_errors("label", bad)  # 4個入りなのに既定が全部
    bad = copy.deepcopy(label); bad["candidates"][0]["source"]["estimation"] = None
    assert ar.estimate_errors("label", bad)  # DM-05
    product = load_json(API_DIR / "examples" / "valid" / "ProductLookupResponse-found.json")
    bad = copy.deepcopy(product); bad["status"] = "not_found"
    assert ar.estimate_errors("product", bad)
    day = load_json(API_DIR / "examples" / "valid" / "DaySummary-three-meals.json")
    bad = copy.deepcopy(day); bad["totals"]["energy_kcal"] += 1
    assert ar.day_errors(bad)
    bad = copy.deepcopy(day); bad["meals"].reverse()
    assert ar.day_errors(bad)
