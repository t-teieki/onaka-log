"""契約テスト共通のヘルパー。"""
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LLM_DIR = REPO_ROOT / "contracts" / "llm"

# Structured Outputs 互換として許可するキーワード（contracts/llm/README.md）
ALLOWED_KEYWORDS = {
    "type", "properties", "required", "additionalProperties", "items", "enum",
    "const", "anyOf", "allOf", "$ref", "$defs", "description", "title",
    "$schema", "$id", "format", "minimum", "maximum", "minLength", "maxLength",
}


def usecase_dirs() -> list[Path]:
    return sorted(p.parent for p in LLM_DIR.glob("*/output.schema.json"))


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def rel(path: Path) -> str:
    return path.relative_to(LLM_DIR).as_posix()


def example_files(kind: str, prefix: str) -> list[Path]:
    """kind は 'valid' / 'invalid'、prefix は 'input' / 'output'。"""
    return sorted(
        f
        for d in usecase_dirs()
        for f in (d / "examples" / kind).glob(f"{prefix}-*.json")
    )


def schema_for(example: Path) -> dict:
    prefix = example.name.split("-", 1)[0]
    return load_json(example.parents[2] / f"{prefix}.schema.json")


def _is_object_type(node: dict) -> bool:
    t = node.get("type")
    return t == "object" or (isinstance(t, list) and "object" in t)


def check_structured_outputs(schema: dict) -> list[str]:
    """Structured Outputs 互換性の違反を文字列のリストで返す（空なら適合）。"""
    errors: list[str] = []

    def walk(node, path: str):
        if isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]")
            return
        if not isinstance(node, dict):
            return
        for key in node:
            if key not in ALLOWED_KEYWORDS:
                errors.append(f"{path}: 許可されていないキーワード '{key}'")
        # 型の配列（["string", "null"] など）と enum の組み合わせは API に拒否される
        # （2026-11-13 の PoC-2 で 400 を確認）。null を許す enum は anyOf で書く
        if "enum" in node and isinstance(node.get("type"), list):
            errors.append(f"{path}: type が配列のまま enum を使っている（anyOf で書く）")
        if _is_object_type(node):
            if node.get("additionalProperties") is not False:
                errors.append(f"{path}: additionalProperties が false ではない")
            props = node.get("properties", {})
            if set(node.get("required", [])) != set(props):
                errors.append(f"{path}: required と properties のキーが一致しない")
        for key, value in node.items():
            if key in ("properties", "$defs"):
                # 子のキーは名前であってキーワードではない
                for name, sub in value.items():
                    walk(sub, f"{path}/{key}/{name}")
            else:
                walk(value, f"{path}/{key}")

    walk(schema, "#")
    errors.extend(_find_recursive_defs(schema))
    return errors


def _refs_in(node) -> set[str]:
    refs: set[str] = set()
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str):
                refs.add(v)
            elif k in ("properties", "$defs"):
                for sub in v.values():
                    refs |= _refs_in(sub)
            else:
                refs |= _refs_in(v)
    elif isinstance(node, list):
        for v in node:
            refs |= _refs_in(v)
    return refs


def _find_recursive_defs(schema: dict) -> list[str]:
    prefix = "#/$defs/"
    defs = schema.get("$defs", {})
    graph = {
        name: {r[len(prefix):] for r in _refs_in(sub) if r.startswith(prefix)}
        for name, sub in defs.items()
    }
    errors = []
    for start in graph:
        seen: set[str] = set()
        stack = list(graph[start])
        while stack:
            cur = stack.pop()
            if cur == start:
                errors.append(f"$defs/{start}: 再帰する $ref")
                break
            if cur in seen or cur not in graph:
                continue
            seen.add(cur)
            stack.extend(graph[cur])
    # ルート自身への参照（"#"）も再帰
    if "#" in _refs_in(schema):
        errors.append("#: ルートへの再帰 $ref")
    return errors


def semantic_errors(usecase: str, data: dict) -> list[str]:
    """contracts/llm/README.md「スキーマで表せない意味上のルール」の違反を返す（空なら適合）。

    推定モジュールの実装でも同じルールを検証する。ここでは契約の例がルールを満たすことと、
    ルール自体が違反を検出できることを確かめる。
    """
    errors: list[str] = []
    if usecase in ("food-photo-estimate", "text-estimate"):
        if data["status"] != "ok":
            if data["items"] != []:
                errors.append("status が ok 以外なのに items が空でない")
            if data["meal_name"] is not None:
                errors.append("status が ok 以外なのに meal_name が null でない")
    elif usecase == "nutrition-label-ocr":
        cols = data["columns"]
        if data["status"] == "ok":
            if not cols:
                errors.append("status が ok なのに columns が空")
            for i, c in enumerate(cols):
                if c["nutrients"]["energy_kcal"] is None:
                    errors.append(f"columns[{i}]: status が ok なのに energy_kcal が null")
        elif cols:
            errors.append("status が ok 以外なのに columns が空でない")
        if len(cols) > 1 and "multiple_labels" not in data["issues"]:
            errors.append("列が複数あるのに issues に multiple_labels がない")
        for i, c in enumerate(cols):
            b = c["basis"]
            if b["type"] == "per_piece" and (b["amount"] is not None or b["unit"] is not None):
                errors.append(f"columns[{i}]: per_piece なのに basis.amount / unit が null でない")
    else:
        errors.append(f"意味ルール未定義の用途: {usecase}")
    return errors
