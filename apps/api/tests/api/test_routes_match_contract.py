"""実装の API の一覧が契約（contracts/api/openapi.yaml）と一致する（TST-06）。"""

from __future__ import annotations

import re

import pytest
import yaml
from api_test_helpers import NOW, REPO_ROOT, FakeEstimator, FakeProducts

from onaka_api.api.app import Deps, create_app
from onaka_api.repository.memory import InMemoryMealRepository

METHODS = {"get", "post", "put", "patch", "delete"}


@pytest.mark.spec("F-001", "F-011", "F-012", "F-013", "F-030", "F-031", "F-032")
def test_paths_and_methods_match_contract() -> None:
    spec = yaml.safe_load((REPO_ROOT / "contracts" / "api" / "openapi.yaml").read_text(encoding="utf-8"))
    contract = {(p, m) for p, item in spec["paths"].items() for m in item if m in METHODS}
    app = create_app(
        Deps(repo=InMemoryMealRepository(), estimator=FakeEstimator(), products=FakeProducts(), now=lambda: NOW)
    )
    generated = app.openapi()
    implemented = {(p, m) for p, item in generated["paths"].items() for m in item if m in METHODS}
    assert implemented == contract


def test_path_parameter_names_match_contract() -> None:
    spec = yaml.safe_load((REPO_ROOT / "contracts" / "api" / "openapi.yaml").read_text(encoding="utf-8"))
    names = {n for p in spec["paths"] for n in re.findall(r"\{(\w+)\}", p)}
    assert names == {"product_code", "record_date", "meal_id", "item_id"}
