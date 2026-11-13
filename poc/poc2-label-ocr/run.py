"""PoC-2 実行: 栄養成分表示の画像を Claude で読み取り、正解 CSV と突き合わせる。

使い方（--yes を付けない限り API は呼ばない。件数と概算費用を表示して終了する）:
  uv run --group poc python poc/poc2-label-ocr/run.py [--models ..] [--efforts ..] [--sizes ..] [--samples ..]
  uv run --group poc python poc/poc2-label-ocr/run.py ... --yes      # 実行（費用が発生）
  uv run --group poc python poc/poc2-label-ocr/run.py --summarize-only
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "poc"))

import score as sc  # noqa: E402
from shared import images, pricing, schemas  # noqa: E402

USECASE = "nutrition-label-ocr"
SAMPLES_DIR = ROOT / "poc" / "samples" / "label"
DEFAULT_CSV = SAMPLES_DIR / "ground_truth.csv"
OUT_DIR = ROOT / "poc" / "results" / "poc2"
RESULTS = OUT_DIR / "results.jsonl"
SUMMARY = OUT_DIR / "summary.md"

ALL_MODELS = list(pricing.PRICES)
_FLOAT_COLS = ("basis_amount", "net_content", *sc.NUTRIENTS)
_LABELS = {"energy_kcal": "kcal", "protein_g": "P", "fat_g": "F", "carbohydrate_g": "C"}


def read_truth(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if not (row.get("sample_id") or "").strip():
                continue
            for c in _FLOAT_COLS:
                v = (row.get(c) or "").strip()
                row[c] = float(v) if v else None
            rows.append(row)
    return rows


def parse_sizes(text: str) -> list[int | None]:
    out: list[int | None] = []
    for tok in text.split(","):
        tok = tok.strip()
        if not tok:
            continue
        out.append(None if tok == "orig" else int(tok))
    return out


def size_label(size: int | None) -> str:
    return "orig" if size is None else str(size)


def split_csv_arg(text: str) -> list[str]:
    return [t.strip() for t in text.split(",") if t.strip()]


# ---------------------------------------------------------------- 計画（dry-run）

def build_plan(truths: list[dict], models: list[str], efforts: list[str], sizes: list[int | None]):
    """(計画の行リスト, 画像が見つからないサンプルID) を返す。画像はメモリ上で処理するだけ。"""
    system, _ = schemas.load_prompt(USECASE)
    plan, missing = [], []
    cache: dict[tuple[str, int | None], tuple] = {}
    for t in truths:
        path = SAMPLES_DIR / "images" / t["image_file"]
        if not path.exists():
            missing.append(t["sample_id"])
            continue
        for size in sizes:
            key = (t["sample_id"], size)
            if key not in cache:
                cache[key] = images.prepare_image(path, size)
            _, w, h, nbytes = cache[key]
            for model in models:
                for effort in efforts:
                    plan.append({
                        "sample_id": t["sample_id"], "model": model, "effort": effort,
                        "size": size, "width": w, "height": h, "bytes": nbytes,
                        "est_jpy": pricing.estimate_call_jpy(model, w, h, system),
                    })
    return plan, missing


def print_plan(plan: list[dict], missing: list[str]) -> None:
    print(f"計画: {len(plan)} 回の呼び出し（dry-run。API は呼んでいない）")
    for i, p in enumerate(plan, 1):
        print(
            f"  {i:3d}. {p['sample_id']} {p['model']} effort={p['effort']} size={size_label(p['size'])} "
            f"{p['width']}x{p['height']} {p['bytes'] / 1024:.0f}KB 概算 {p['est_jpy']:.2f}円"
        )
    total = sum(p["est_jpy"] for p in plan)
    print(f"概算費用合計: {total:.1f} 円（出力 {pricing.ASSUMED_OUTPUT_TOKENS} トークン/回の保守的な仮定。キャッシュなし）")
    if missing:
        print(f"画像が見つからないためスキップ: {', '.join(missing)}")
    print("実行するには --yes を付ける。")


# ---------------------------------------------------------------- 実行

def run(plan_args, truths, models, efforts, sizes) -> None:
    import anthropic
    from dotenv import load_dotenv

    from shared import claude_client

    load_dotenv(ROOT / ".env")  # キーは表示しない
    client = anthropic.Anthropic()
    system, prompt_version = schemas.load_prompt(USECASE)
    full_schema = schemas.load_schema(USECASE)
    api_schema = schemas.strip_unsupported(full_schema)
    schema_id = full_schema.get("$id")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    n = 0
    try:
        for t in truths:
            path = SAMPLES_DIR / "images" / t["image_file"]
            if not path.exists():
                print(f"skip {t['sample_id']}: 画像なし")
                continue
            for size in sizes:
                b64, w, h, nbytes = images.prepare_image(path, size)
                for model in models:
                    for effort in efforts:
                        n += 1
                        r = claude_client.call_image(
                            client, model=model, system=system, api_schema=api_schema,
                            image_b64=b64, effort=effort,
                        )
                        if r["parsed"] is not None:
                            scores = sc.score_one(r["parsed"], t, full_schema)
                        else:
                            scores = sc.score_error(t)
                        row = {
                            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                            "sample_id": t["sample_id"], "model": model, "effort": effort,
                            "size": size_label(size), "image": {"width": w, "height": h, "bytes": nbytes},
                            "prompt_version": prompt_version, "schema_id": schema_id,
                            "expected_status": t["expected_status"],
                            "usage": r["usage"], "latency_s": r["latency_s"],
                            "cost_jpy": pricing.cost_jpy(model, r["usage"]) if r["usage"] else 0.0,
                            "stop_reason": r["stop_reason"], "parsed": r["parsed"],
                            "scores": scores, "error": r["error"],
                        }
                        if "raw_text" in r:
                            row["raw_text"] = r["raw_text"]
                        with RESULTS.open("a", encoding="utf-8", newline="\n") as f:
                            f.write(json.dumps(row, ensure_ascii=False) + "\n")
                        status = "ERROR " + r["error"] if r["error"] else f"status={scores['pred_status']}"
                        print(
                            f"[{n}] {t['sample_id']} {model} {effort} {size_label(size)}: {status} "
                            f"{r['latency_s']:.1f}s {row['cost_jpy']:.2f}円"
                        )
    except KeyboardInterrupt:
        print("中断。ここまでの結果で summary を作る。")
    summarize()


# ---------------------------------------------------------------- 集計

def load_rows(path: Path = RESULTS) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def latest_per_key(rows: list[dict]) -> list[dict]:
    """同じ (sample, model, effort, size) は最後の 1 件だけ採点に使う（費用は全件を合算）。"""
    d: dict[tuple, dict] = {}
    for r in rows:
        d[(r["sample_id"], r["model"], r["effort"], r["size"])] = r
    return list(d.values())


def rate(vals: list[bool | None]) -> str:
    v = [x for x in vals if x is not None]
    if not v:
        return "-"
    return f"{sum(1 for x in v if x)}/{len(v)} ({sum(1 for x in v if x) / len(v) * 100:.0f}%)"


def fnum(v, nd: int = 1) -> str:
    return "-" if v is None else f"{v:.{nd}f}"


def _pred_nutrient(r: dict, n: str):
    p = r.get("parsed")
    return None if not p else p.get("nutrients", {}).get(n)


def _basis_str(d: dict | None) -> str:
    if not d:
        return "-"
    b = d.get("basis") or {}
    return f"{b.get('type')} {b.get('amount')}{b.get('unit') or ''}"


def _net_str(d: dict | None) -> str:
    if not d:
        return "-"
    n = d.get("net_content") or {}
    return f"{n.get('amount')}{n.get('unit') or ''}"


def build_summary(rows: list[dict], truths: dict[str, dict]) -> str:
    L = ["# PoC-2 栄養成分表示 OCR 結果サマリ", ""]
    if not rows:
        return "\n".join(L + ["結果なし。"]) + "\n"
    total_cost = sum(r.get("cost_jpy") or 0 for r in rows)
    pv = sorted({r.get("prompt_version") for r in rows})
    sid = sorted({r.get("schema_id") for r in rows})
    L += [
        f"- 実行数: {len(rows)} 回（採点対象: 同一条件の最新のみ）",
        f"- prompt_version: {', '.join(map(str, pv))} / スキーマ: {', '.join(map(str, sid))}",
        f"- **総費用: {total_cost:.1f} 円**",
        "",
        "## 設定ごとの結果",
        "",
        "正答率は expected_status が ok のサンプルが対象（status 正答率とスキーマ・意味検証は全サンプル）。"
        "エラー（API エラー・refusal・max_tokens）は不正解として数える。",
        "",
        "| モデル | effort | 画像長辺 | n | エラー | status | kcal | P | F | C | 4項目 | 基準量 | 内容量 | schema | semantic | 平均応答(s) | 費用(円) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    scored = latest_per_key(rows)
    configs = sorted({(r["model"], r["effort"], r["size"]) for r in rows})
    for model, effort, size in configs:
        rs = [r for r in scored if (r["model"], r["effort"], r["size"]) == (model, effort, size)]
        cost = sum(r.get("cost_jpy") or 0 for r in rows if (r["model"], r["effort"], r["size"]) == (model, effort, size))
        lat = [r["latency_s"] for r in rs if r.get("latency_s") is not None]
        sc_ = [r["scores"] for r in rs]
        cells = [
            model, effort, size, str(len(rs)), str(sum(1 for r in rs if r.get("error"))),
            rate([s["status_ok"] for s in sc_]),
            *[rate([s["nutrients"][n] for s in sc_]) for n in sc.NUTRIENTS],
            rate([s["all4_correct"] for s in sc_]),
            rate([s["basis_correct"] for s in sc_]),
            rate([s["net_content_correct"] for s in sc_]),
            rate([s["schema_valid"] for s in sc_]),
            rate([s["semantic_ok"] for s in sc_]),
            fnum(sum(lat) / len(lat) if lat else None),
            fnum(cost, 2),
        ]
        L.append("| " + " | ".join(cells) + " |")

    L += ["", "## サンプルごとの詳細（予測 / 正解）", ""]
    for model, effort, size in configs:
        L += [f"### {model} / effort={effort} / size={size}", ""]
        L += [
            "| sample | status | kcal | P | F | C | 基準量(type amount) | 内容量 | 応答(s) | 備考 |",
            "|---|---|---|---|---|---|---|---|---|---|",
        ]
        rs = sorted(
            (r for r in scored if (r["model"], r["effort"], r["size"]) == (model, effort, size)),
            key=lambda r: r["sample_id"],
        )
        for r in rs:
            t = truths.get(r["sample_id"], {})
            s = r["scores"]
            p = r.get("parsed")
            mark = lambda ok: "" if ok is None else (" ○" if ok else " ×")  # noqa: E731
            cells = [
                r["sample_id"],
                f"{s['pred_status']} / {t.get('expected_status')}{mark(s['status_ok'])}",
                *[
                    f"{fnum(_pred_nutrient(r, n))} / {fnum(t.get(n))}{mark(s['nutrients'][n])}"
                    for n in sc.NUTRIENTS
                ],
                f"{_basis_str(p)} / {t.get('basis')} {fnum(t.get('basis_amount'), 0)}{t.get('basis_unit') or ''}{mark(s['basis_correct'])}",
                f"{_net_str(p)} / {fnum(t.get('net_content'), 0)}{t.get('net_content_unit') or ''}{mark(s['net_content_correct'])}",
                fnum(r.get("latency_s")),
                (r.get("error") or ("schema違反あり" if s.get("schema_valid") is False else ""))[:80],
            ]
            L.append("| " + " | ".join(c.replace("|", "\\|") for c in cells) + " |")
        L.append("")
    L += [f"**総費用: {total_cost:.1f} 円**", ""]
    return "\n".join(L)


def summarize(csv_path: Path = DEFAULT_CSV) -> None:
    rows = load_rows()
    truths = {t["sample_id"]: t for t in read_truth(csv_path)}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY.write_text(build_summary(rows, truths), encoding="utf-8", newline="\n")
    print(f"summary を書き出した: {SUMMARY.relative_to(ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", default=",".join(ALL_MODELS), help="カンマ区切り（既定: 3モデル）")
    ap.add_argument("--efforts", default="low,medium", help="カンマ区切り（既定: low,medium）")
    ap.add_argument("--sizes", default="orig", help="長辺 px のカンマ区切り。orig は縮小なし（既定: orig）")
    ap.add_argument("--samples", default="", help="サンプルID のカンマ区切り（既定: 全件）")
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--yes", action="store_true", help="実際に API を呼ぶ（費用が発生する）")
    ap.add_argument("--summarize-only", action="store_true", help="既存の results.jsonl から summary.md を作り直す")
    args = ap.parse_args()

    if args.summarize_only:
        summarize(args.csv)
        return 0

    models = split_csv_arg(args.models)
    unknown = [m for m in models if m not in pricing.PRICES]
    if unknown:
        print(f"未知のモデル: {unknown}（候補: {ALL_MODELS}）", file=sys.stderr)
        return 2
    efforts = split_csv_arg(args.efforts)
    sizes = parse_sizes(args.sizes)
    truths = read_truth(args.csv)
    ids = set(split_csv_arg(args.samples))
    if ids:
        truths = [t for t in truths if t["sample_id"] in ids]

    plan, missing = build_plan(truths, models, efforts, sizes)
    print_plan(plan, missing)
    if not args.yes:
        return 0
    if not plan:
        print("実行する呼び出しがない。")
        return 1
    run(plan, truths, models, efforts, sizes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
