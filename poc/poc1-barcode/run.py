"""PoC-1 実行: 正解 CSV を読み、Open Food Facts を引いて評価し、結果を書き出す。

使い方: uv run --group poc python poc/poc1-barcode/run.py [--refresh] [--csv PATH]
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import evaluate as ev  # noqa: E402
import off_client  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CSV = ROOT / "poc" / "samples" / "barcode" / "ground_truth.csv"
OUT_DIR = ROOT / "poc" / "results" / "poc1"

_FLOAT_COLS = ("basis_amount", "net_content", *ev.NUTRIENTS)
_LABELS = {
    "energy_kcal": "kcal",
    "protein_g": "タンパク質",
    "fat_g": "脂質",
    "carbohydrate_g": "炭水化物",
}


def read_truth(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if not (row.get("sample_id") or "").strip():
                continue
            for c in _FLOAT_COLS:
                v = (row.get(c) or "").strip()
                row[c] = float(v) if v else None
            row["jan"] = row["jan"].strip()
            rows.append(row)
    return rows


def pct(v: float | None) -> str:
    return "-" if v is None else f"{v * 100:.0f}%"


def ratio(num: int, den: int) -> str:
    return f"{num}/{den} ({pct(num / den if den else None)})"


def fmt(v: float | None, nd: int = 1) -> str:
    return "-" if v is None else f"{v:.{nd}f}"


def build_summary(results: list[dict], m: dict) -> str:
    n = m["n"]
    L = ["# PoC-1 バーコード照合 結果サマリ", ""]
    if n < 20:
        L += [
            f"> 警告: サンプル数 {n} 件（20 件未満）のため、採否の判定は行わない（サンプル数不足のため判定保留）。",
            "",
        ]
    L += ["## 指標", "", "| 指標 | 結果 |", "|---|---|"]
    L.append(f"| サンプル数 | {n} |")
    L.append(f"| ① OFF で見つかった割合 | {ratio(m['found'], n)} |")
    L.append(f"| ② 見つかった中で 4項目（100g 当たり）がそろう割合 | {ratio(m['all4'], m['found'])} |")
    L.append(f"| 　うち kJ のみ（kcal は換算） | {m['energy_from_kj']} 件 |")
    L.append(f"| ③ 見つかった中で OFF に内容量がある割合 | {ratio(m['net_content'], m['found'])} |")
    L.append(f"| ③' 見つかった中で 内容量 または 1食分の量 がある割合 | {ratio(m['net_or_serving'], m['found'])} |")
    L.append(f"| 　うち 1食分の量が正解の内容量と一致（±1%） | {m['serving_equals_net']} 件 |")
    per = ", ".join(f"{k}: {v}" for k, v in sorted(m["per_breakdown"].items())) or "-"
    L.append(f"| ④ nutrition_data_per の内訳（見つかった商品） | {per} |")
    L.append(f"| ⑤ 比較可能な件数 | {m['comparable']} |")
    for nut in ev.NUTRIENTS:
        x = m["nutrient_match"][nut]
        L.append(f"| ⑤ {_LABELS[nut]} の一致率 | {ratio(x['match'], x['total'])} |")
    L.append(f"| ⑤ 4項目すべて一致 | {ratio(m['all4_match'], m['comparable'])} |")
    L.append(f"| ①×②（使える割合 = 4項目そろい / 全件） | {ratio(m['usable'], n)} |")
    verdict = {
        "hold": "判定保留（サンプル数不足）",
        "adopt": "主力として採用（50% 以上）",
        "demote": "主力にしない（20% 未満）",
        "consult": "20〜50%: 相談して判断",
    }[m["verdict"]]
    L += ["", f"判定: **{verdict}**", ""]
    L += [
        "許容誤差: kcal は max(5%, 5 kcal)、P/F/C は max(5%, 0.5 g)。"
        "換算は正解の基準量（per_package なら basis_amount）で OFF の 100g 当たり値を換算。",
        "",
        "## サンプル別",
        "",
        "| ID | JAN | 見つかった | OFF 商品名 | per | 比較 | kcal OFF/正解 | P | F | C | 一致 | フラグ・理由 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        conv = r["converted"] or {}
        t = r["truth"]

        def pair(nut: str) -> str:
            if not conv:
                return "-"
            mk = r["nutrients"][nut]["match"]
            mark = "" if mk is None else (" ○" if mk else " ×")
            return f"{fmt(conv[nut])}/{fmt(t[nut])}{mark}"

        flags = [k for k, v in r["flags"].items() if v] + r["reasons"]
        L.append(
            "| {id} | {jan} | {found} | {name} | {per} | {cmp} | {k} | {p} | {f} | {c} | {all4} | {fl} |".format(
                id=r["sample_id"],
                jan=r["jan"],
                found="はい" if r["found"] else "いいえ",
                name=(r["off_product_name"] or "-").replace("|", "/"),
                per=r["nutrition_data_per"] or "-",
                cmp="可" if r["comparable"] else "不可",
                k=pair("energy_kcal"),
                p=pair("protein_g"),
                f=pair("fat_g"),
                c=pair("carbohydrate_g"),
                all4="-" if r["all4_match"] is None else ("○" if r["all4_match"] else "×"),
                fl=", ".join(flags) or "-",
            )
        )
    L += ["", "## 内容量（OFF の記載と正解）", "", "| ID | OFF 内容量 | OFF 1食分の量 | 正解 |", "|---|---|---|---|"]
    for r in results:
        o = r["off_net_content"]
        s = r.get("off_serving")
        tn = r["truth_net_content"]
        o_s = "なし" if not o else f"{o['value']:g} {o['unit'] or '?'} ({o['source']})"
        s_s = "なし" if not s else f"{s['value']:g} {s['unit'] or '?'}"
        L.append(f"| {r['sample_id']} | {o_s} | {s_s} | {fmt(tn['value'], 0)} {tn['unit'] or ''} |")
    warns = [r for r in results if r["reasons"] and set(r["reasons"]) - {"off_net_content_missing"}]
    if warns:
        L += ["", "## 注意"]
        for r in warns:
            L.append(f"- {r['sample_id']}: {', '.join(r['reasons'])}")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--refresh", action="store_true", help="キャッシュを無視して再取得する")
    args = ap.parse_args()

    truths = read_truth(args.csv)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_dir = OUT_DIR / "raw"
    results = []
    for t in truths:
        payload, cached = off_client.get_product(t["jan"], raw_dir, refresh=args.refresh)
        print(f"{t['sample_id']} {t['jan']}: {'cache' if cached else 'fetched'}", file=sys.stderr)
        results.append(ev.evaluate_sample(t, payload))

    with (OUT_DIR / "results.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    summary = build_summary(results, ev.aggregate(results))
    (OUT_DIR / "summary.md").write_text(summary, encoding="utf-8", newline="\n")
    print(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
