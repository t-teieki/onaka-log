"""仕様の ID とテストの対応表を作る（TST-02）。

テストに付けた `@pytest.mark.spec("DM-03", ...)` を集め、docs の仕様の ID と突き合わせる。

使い方（WSL の uv で）:
  uv run --group dev python tools/trace.py           # docs/03_testing/traceability.md の対応表を書き直す
  uv run --group dev python tools/trace.py --check   # 書き直さず、抜け・不明な ID があれば終了コード 1

対象の ID:
  - DM-xx: docs/02_design/domain-model.md §6 の表（すべて必須）
  - F-xxx: docs/01_requirements/features/README.md で区分が MVP の行（テストがなくても警告だけ。画面の機能はアプリのテストで結びつける）
  - F-xxx-yy: 機能の詳細仕様の要件。F-xxx として数える
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DOMAIN_MODEL = ROOT / "docs" / "02_design" / "domain-model.md"
FEATURES = ROOT / "docs" / "01_requirements" / "features" / "README.md"
OUT = ROOT / "docs" / "03_testing" / "traceability.md"
BEGIN, END = "<!-- trace:begin -->", "<!-- trace:end -->"
TEST_PATHS = [ROOT / "tests", ROOT / "apps" / "api" / "tests"]


def spec_ids() -> tuple[dict[str, str], dict[str, str]]:
    """(必須の ID → 説明, MVP の機能 ID → 名前)。"""
    dm = dict(re.findall(r"^\| (DM-\d{2}) \| (.+?) \|$", DOMAIN_MODEL.read_text(encoding="utf-8"), re.M))
    features = {
        fid: name
        for fid, name in re.findall(r"^\| (F-\d{3}) \| ([^|]+?) \| MVP \|", FEATURES.read_text(encoding="utf-8"), re.M)
    }
    return dm, features


class _Collector:
    def __init__(self) -> None:
        self.by_id: dict[str, set[str]] = defaultdict(set)

    def pytest_collection_modifyitems(self, items):
        for item in items:
            for mark in item.iter_markers("spec"):
                for sid in mark.args:
                    # パラメータ違いは1つのテスト関数として数える
                    self.by_id[sid].add(item.nodeid.split("[")[0])


def collect() -> dict[str, set[str]]:
    collector = _Collector()
    paths = [str(p) for p in TEST_PATHS if p.exists()]
    code = pytest.main(["--collect-only", "-qq", "-p", "no:cacheprovider", *paths], plugins=[collector])
    if code not in (0, 5):  # 5 = テストなし
        sys.exit(f"テストの収集に失敗した（pytest の終了コード {code}）")
    return collector.by_id


def build(dm: dict, features: dict, by_id: dict) -> tuple[str, list[str], list[str], list[str]]:
    covered_f: dict[str, set[str]] = defaultdict(set)
    unknown = []
    for sid, tests in by_id.items():
        m = re.fullmatch(r"(F-\d{3})(-\d{2})?", sid)
        if m:
            covered_f[m.group(1)] |= tests
            if m.group(1) not in features:
                unknown.append(sid)
        elif sid not in dm:
            unknown.append(sid)
    missing_dm = [d for d in dm if not by_id.get(d)]
    missing_f = [f for f in features if not covered_f.get(f)]

    lines = ["### ドメインのルール（DM、すべて必須）", "", "| ID | ルール | テスト数 | テスト |", "|---|---|---|---|"]
    for d, desc in dm.items():
        tests = sorted(by_id.get(d, []))
        short = desc if len(desc) <= 40 else desc[:40] + "…"
        lines.append(f"| {d} | {short} | {len(tests) or '**0**'} | {'<br>'.join(f'`{t}`' for t in tests) or '—'} |")
    lines += ["", "### MVP の機能（F）", "", "| ID | 機能 | テスト数 | テスト |", "|---|---|---|---|"]
    for f, name in features.items():
        tests = sorted(covered_f.get(f, []))
        lines.append(f"| {f} | {name} | {len(tests) or '0（未）'} | {'<br>'.join(f'`{t}`' for t in tests) or '—'} |")
    return "\n".join(lines), missing_dm, missing_f, sorted(unknown)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="書き直さずに検査だけする")
    args = ap.parse_args()

    dm, features = spec_ids()
    table, missing_dm, missing_f, unknown = build(dm, features, collect())

    if not args.check:
        doc = OUT.read_text(encoding="utf-8")
        head, rest = doc.split(BEGIN, 1)
        _, tail = rest.split(END, 1)
        OUT.write_text(f"{head}{BEGIN}\n\n{table}\n\n{END}{tail}", encoding="utf-8", newline="\n")
        print(f"書き直した: {OUT.relative_to(ROOT)}")

    if missing_f:
        print(f"警告: テストに結びついていない MVP の機能: {', '.join(missing_f)}")
    ok = True
    if missing_dm:
        print(f"エラー: テストに結びついていない DM: {', '.join(missing_dm)}")
        ok = False
    if unknown:
        print(f"エラー: 仕様にない ID がテストに付いている: {', '.join(unknown)}")
        ok = False
    if ok:
        print("OK: DM はすべてテストに結びついている")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
