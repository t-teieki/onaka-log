"""バックエンドのテスト共通のヘルパー。

conftest.py にしないのは、契約テスト（tests/contract/conftest.py）と同じセッションで集めたときに
`from conftest import ...` の名前がぶつかるため。
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
DOMAIN_EXAMPLES = REPO_ROOT / "contracts" / "domain" / "examples"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def to_input(item: dict[str, Any]) -> dict[str, Any]:
    """保存済みの食品（例ファイル）から、保存 API が受け取る食品の入力（FoodItemInput）を作る。"""
    out = {k: item[k] for k in ("item_id", "name", "source", "reference", "estimate_detail")}
    out["portion"] = {k: item["portion"][k] for k in ("mode", "fraction", "pieces")}
    return out


def assert_same(actual: Any, expected: Any, path: str = "$") -> None:
    """dict・list を再帰的に比べる。数値は誤差 1e-9 まで同じとみなす。"""
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: dict ではない（{actual!r}）"
        assert set(actual) == set(expected), f"{path}: キーが違う {sorted(set(actual) ^ set(expected))}"
        for k in expected:
            assert_same(actual[k], expected[k], f"{path}.{k}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), f"{path}: 件数が違う"
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_same(a, e, f"{path}[{i}]")
    elif isinstance(expected, (int, float)) and not isinstance(expected, bool):
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool), f"{path}: 数値ではない（{actual!r}）"
        assert math.isclose(actual, expected, abs_tol=1e-9), f"{path}: {actual} != {expected}"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture(*parts: str) -> Any:
    return load_json(FIXTURES.joinpath(*parts))


def _api_registry() -> tuple[Any, str]:
    """contracts/api/openapi.yaml と、そこから参照するスキーマを解決できるレジストリ（契約テストと同じ仕組み）。"""
    import yaml
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT202012

    openapi = REPO_ROOT / "contracts" / "api" / "openapi.yaml"
    spec = yaml.safe_load(openapi.read_text(encoding="utf-8"))
    resources = [(openapi.as_uri(), Resource(contents=spec, specification=DRAFT202012))]
    for path in list((REPO_ROOT / "contracts").glob("*/*.schema.json")) + list(
        (REPO_ROOT / "contracts" / "llm").glob("*/*.schema.json")
    ):
        contents = load_json(path)
        res = Resource(contents=contents, specification=DRAFT202012)
        resources.append((path.as_uri(), res))
        if "$id" in contents:
            resources.append((contents["$id"], res))
    return Registry().with_resources(resources), openapi.as_uri()


def api_schema_errors(component: str, data: Any) -> list[str]:
    """contracts/api/openapi.yaml の components.schemas[component] での検証エラー（空なら適合）。"""
    from jsonschema import Draft202012Validator

    registry, uri = _api_registry()
    validator = Draft202012Validator({"$ref": f"{uri}#/components/schemas/{component}"}, registry=registry)
    return [f"{list(e.absolute_path)}: {e.message}" for e in validator.iter_errors(data)]
