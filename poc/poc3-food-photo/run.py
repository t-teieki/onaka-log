"""PoC-3 実行: 料理の写真から料理名・量・kcal・PFC を推定し、正解なしで評価する。

使い方（--yes を付けない限り API は呼ばない。件数と概算費用を表示して終了する）:
  uv run --group poc python poc/poc3-food-photo/run.py [--configs ..] [--repeats 3] [--size 1024] [--samples ..]
  uv run --group poc python poc/poc3-food-photo/run.py ... --yes      # 実行（費用が発生）
  uv run --group poc python poc/poc3-food-photo/run.py --summarize-only

--configs は「モデル:effort」のカンマ区切り（例: claude-haiku-5-5:low,claude-sonnet-5-5:medium）。
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "poc"))

import metrics as mt  # noqa: E402
from shared import images, pricing, schemas  # noqa: E402

USECASE = "food-photo-estimate"
SAMPLES_DIR = ROOT / "poc" / "samples" / "photo"
DEFAULT_CSV = SAMPLES_DIR / "ground_truth.csv"
OUT_DIR = ROOT / "poc" / "results" / "poc3"
RESULTS = OUT_DIR / "results.jsonl"
SUMMARY = OUT_DIR / "summary.md"
DEFAULT_CONFIGS = "claude-haiku-5-5:low,claude-haiku-5-5:medium,claude-sonnet-5-5:medium,claude-opus-5-5:medium"


def read_samples(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f) if (r.get("sample_id") or "").strip()]


def parse_configs(text: str) -> list[tuple[str, str]]:
    out = []
    for tok in text.split(","):
        tok = tok.strip()
        if not tok:
            continue
        model, _, effort = tok.partition(":")
        if model not in pricing.PRICES or effort not in ("low", "medium", "high"):
            raise ValueError(f"不正な設定: {tok}（モデル候補: {list(pricing.PRICES)}、effort: low/medium/high）")
        out.append((model, effort))
    return out


def size_label(size: int | None) -> str:
    return "orig" if size is None else str(size)


# ---------------------------------------------------------------- 計画（dry-run）

def build_plan(samples, configs, repeats, size):
    system, _ = schemas.load_prompt(USECASE)
    plan, missing = [], []
    for s in samples:
        path = SAMPLES_DIR / "images" / s["image_file"]
        if not path.exists():
            missing.append(s["sample_id"])
            continue
        _, w, h, nbytes = images.prepare_image(path, size)
        for model, effort in configs:
            for rep in range(1, repeats + 1):
                plan.append({
                    "sample_id": s["sample_id"], "model": model, "effort": effort, "rep": rep,
                    "width": w, "height": h, "bytes": nbytes,
                    "est_jpy": pricing.estimate_call_jpy(model, w, h, system),
                })
    return plan, missing


def print_plan(plan, missing, size) -> None:
    print(f"計画: {len(plan)} 回の呼び出し（dry-run。API は呼んでいない）。画像の長辺 {size_label(size)}")
    by_cfg: dict[tuple, list] = {}
    for p in plan:
        by_cfg.setdefault((p["model"], p["effort"]), []).append(p)
    for (model, effort), ps in by_cfg.items():
        print(f"  {model} effort={effort}: {len(ps)} 回 概算 {sum(p['est_jpy'] for p in ps):.1f}円")
    print(f"概算費用合計: {sum(p['est_jpy'] for p in plan):.1f} 円"
          f"（出力 {pricing.ASSUMED_OUTPUT_TOKENS} トークン/回の保守的な仮定。キャッシュなし）")
    if missing:
        print(f"画像が見つからないためスキップ: {', '.join(missing)}")
    print("実行するには --yes を付ける。")


# ---------------------------------------------------------------- 実行

def run(samples, configs, repeats, size) -> None:
    import anthropic
    from dotenv import load_dotenv

    from shared import claude_client

    load_dotenv(ROOT / ".env")  # キーは表示しない
    client = anthropic.Anthropic()
    system, prompt_version = schemas.load_prompt(USECASE)
    full_schema = schemas.load_schema(USECASE)
    api_schema = schemas.strip_unsupported(full_schema)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    n = 0
    try:
        for s in samples:
            path = SAMPLES_DIR / "images" / s["image_file"]
            if not path.exists():
                print(f"skip {s['sample_id']}: 画像なし")
                continue
            b64, w, h, nbytes = images.prepare_image(path, size)
            for model, effort in configs:
                for rep in range(1, repeats + 1):
                    n += 1
                    r = claude_client.call_image(
                        client, model=model, system=system, api_schema=api_schema,
                        image_b64=b64, effort=effort,
                    )
                    p = r["parsed"]
                    row = {
                        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "sample_id": s["sample_id"], "model": model, "effort": effort, "rep": rep,
                        "size": size_label(size), "image": {"width": w, "height": h, "bytes": nbytes},
                        "prompt_version": prompt_version, "schema_id": full_schema.get("$id"),
                        "usage": r["usage"], "latency_s": r["latency_s"],
                        "cost_jpy": pricing.cost_jpy(model, r["usage"]) if r["usage"] else 0.0,
                        "stop_reason": r["stop_reason"], "parsed": p, "error": r["error"],
                        "schema_errors": mt.validate_output(p, full_schema) if p is not None else None,
                        "semantic_errors": mt.semantic_errors(p) if p is not None else None,
                    }
                    if "raw_text" in r:
                        row["raw_text"] = r["raw_text"]
                    with RESULTS.open("a", encoding="utf-8", newline="\n") as f:
                        f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    t = mt.totals(p)
                    status = "ERROR " + r["error"] if r["error"] else (
                        f"status={p.get('status')} items={len(p.get('items') or [])}"
                        + (f" {t['energy_kcal']:.0f}kcal" if t else ""))
                    print(f"[{n}] {s['sample_id']} {model} {effort} #{rep}: {status} "
                          f"{r['latency_s']:.1f}s {row['cost_jpy']:.2f}円")
    except KeyboardInterrupt:
        print("中断。ここまでの結果で summary を作る。")
    summarize()


# ---------------------------------------------------------------- 集計

def load_rows(path: Path = RESULTS) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def latest_runs(rows: list[dict]) -> list[dict]:
    """同じ (sample, model, effort, size, rep) は最後の1件だけ使う（費用は全件を合算）。"""
    d: dict[tuple, dict] = {}
    for r in rows:
        d[(r["sample_id"], r["model"], r["effort"], r["size"], r["rep"])] = r
    return list(d.values())


def fnum(v, nd: int = 0) -> str:
    return "-" if v is None else f"{v:.{nd}f}"


def fpct(v) -> str:
    return "-" if v is None else f"{v * 100:.1f}%"


def frate(vals: list[bool]) -> str:
    return "-" if not vals else f"{sum(vals)}/{len(vals)} ({sum(vals) / len(vals) * 100:.0f}%)"


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    v = sorted(values)
    k = (len(v) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def group_stats(rs: list[dict]) -> dict:
    """同じサンプル・同じ設定の複数回の結果をまとめる。"""
    tots = [t for t in (mt.totals(r.get("parsed")) for r in rs) if t]
    out = {"n": len(rs), "n_ok": len(tots)}
    for n in mt.NUTRIENTS:
        vals = [t[n] for t in tots]
        out[f"mean_{n}"] = statistics.fmean(vals) if vals else None
        out[f"cv_{n}"] = mt.cv(vals)
    counts = [len(mt.item_names(r.get("parsed"))) for r in rs if r.get("parsed")]
    out["items_min"] = min(counts) if counts else None
    out["items_max"] = max(counts) if counts else None
    return out


def build_summary(rows: list[dict], samples: dict[str, dict]) -> str:
    L = ["# PoC-3 写真からの推定 結果サマリ（正解なし）", ""]
    if not rows:
        return "\n".join(L + ["結果なし。"]) + "\n"
    runs = latest_runs(rows)
    total_cost = sum(r.get("cost_jpy") or 0 for r in rows)
    configs = sorted({(r["model"], r["effort"], r["size"]) for r in runs})
    sids = sorted({r["sample_id"] for r in runs})
    L += [
        f"- 実行数: {len(rows)} 回 / prompt_version: {', '.join(sorted({str(r.get('prompt_version')) for r in rows}))}"
        f" / スキーマ: {', '.join(sorted({str(r.get('schema_id')) for r in rows}))}",
        f"- **総費用: {total_cost:.1f} 円**",
        f"- アトウォーター: 品目ごとに kcal と 4P+9F+4C の差が ±{mt.ATWATER_TOL:.0%} 以内か（{mt.ATWATER_MIN_KCAL:.0f}kcal 未満の品目は対象外）",
        f"- CV: 同じ写真・同じ設定の複数回の合計 kcal の変動係数。目安は {mt.CV_TARGET:.0%} 以内",
        "",
        "## 設定ごとの結果",
        "",
        "| モデル | effort | 画像 | 回数 | エラー | status ok | schema | 意味ルール | アトウォーター | CV kcal 平均 | CV kcal 最大 | CV≦10% の写真 | 応答 p50 / p90 (s) | 1回の費用(円) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for cfg in configs:
        rs = [r for r in runs if (r["model"], r["effort"], r["size"]) == cfg]
        cost = [r.get("cost_jpy") or 0 for r in rs]
        lat = [r["latency_s"] for r in rs if r.get("latency_s") is not None]
        cvs = [group_stats([r for r in rs if r["sample_id"] == s])["cv_energy_kcal"] for s in sids]
        cvs = [c for c in cvs if c is not None]
        atw = [ok for r in rs for ok in mt.atwater_checks(r.get("parsed"))]
        L.append("| " + " | ".join([
            cfg[0], cfg[1], cfg[2], str(len(rs)), str(sum(1 for r in rs if r.get("error"))),
            frate([bool(r.get("parsed")) and r["parsed"].get("status") == "ok" for r in rs]),
            frate([r.get("schema_errors") == [] for r in rs]),
            frate([r.get("semantic_errors") == [] for r in rs]),
            frate(atw),
            fpct(statistics.fmean(cvs) if cvs else None), fpct(max(cvs) if cvs else None),
            frate([c <= mt.CV_TARGET for c in cvs]),
            f"{fnum(percentile(lat, 0.5), 1)} / {fnum(percentile(lat, 0.9), 1)}",
            fnum(statistics.fmean(cost) if cost else None, 2),
        ]) + " |")

    L += ["", "## 写真ごとの合計（複数回の平均）と設定間の差", "",
          "「中央値との差」は、その写真の全設定の平均 kcal の中央値に対する差（正解との差ではない）。", ""]
    for sid in sids:
        note = samples.get(sid, {}).get("notes") or ""
        L += [f"### {sid} {note}".rstrip(), "",
              "| モデル | effort | kcal | P | F | C | CV kcal | 品目数 | 中央値との差 |",
              "|---|---|---|---|---|---|---|---|---|"]
        stats = {cfg: group_stats([r for r in runs if r["sample_id"] == sid
                                   and (r["model"], r["effort"], r["size"]) == cfg]) for cfg in configs}
        means = [s["mean_energy_kcal"] for s in stats.values() if s["n"] and s["mean_energy_kcal"] is not None]
        med = statistics.median(means) if means else None
        for cfg, s in stats.items():
            if not s["n"]:
                continue
            items = "-" if s["items_min"] is None else (
                str(s["items_min"]) if s["items_min"] == s["items_max"] else f"{s['items_min']}〜{s['items_max']}")
            diff = mt.rel_diff(s["mean_energy_kcal"], med)
            L.append("| " + " | ".join([
                cfg[0], cfg[1], fnum(s["mean_energy_kcal"]), fnum(s["mean_protein_g"], 1),
                fnum(s["mean_fat_g"], 1), fnum(s["mean_carbohydrate_g"], 1),
                fpct(s["cv_energy_kcal"]), items, "-" if diff is None else f"{diff * 100:+.0f}%",
            ]) + " |")
        L.append("")

    L += ["## 品目の内訳（各設定の1回目）", ""]
    for sid in sids:
        L += [f"### {sid}", ""]
        for cfg in configs:
            first = sorted((r for r in runs if r["sample_id"] == sid
                            and (r["model"], r["effort"], r["size"]) == cfg), key=lambda r: r["rep"])
            if not first:
                continue
            p = first[0].get("parsed") or {}
            parts = [f"{i.get('name')} {fnum((i.get('nutrients') or {}).get('energy_kcal'))}kcal"
                     f"（{fnum(i.get('estimated_weight_g'))}g, {i.get('confidence')}）" for i in p.get("items") or []]
            L.append(f"- **{cfg[0]} / {cfg[1]}**: {p.get('meal_name')} — " + ("、".join(parts) or first[0].get("error") or "-"))
        L.append("")
    L += [f"**総費用: {total_cost:.1f} 円**", ""]
    return "\n".join(L)


def summarize(csv_path: Path = DEFAULT_CSV) -> None:
    rows = load_rows()
    samples = {s["sample_id"]: s for s in read_samples(csv_path)}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY.write_text(build_summary(rows, samples), encoding="utf-8", newline="\n")
    print(f"summary を書き出した: {SUMMARY.relative_to(ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--configs", default=DEFAULT_CONFIGS, help="モデル:effort のカンマ区切り")
    ap.add_argument("--repeats", type=int, default=3, help="同じ写真・同じ設定で推定する回数（既定 3）")
    ap.add_argument("--size", default="1024", help="画像の長辺 px。orig は縮小なし（既定 1024、ADR-0010 と同じ）")
    ap.add_argument("--samples", default="", help="サンプルID のカンマ区切り（既定: 全件）")
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--yes", action="store_true", help="実際に API を呼ぶ（費用が発生する）")
    ap.add_argument("--summarize-only", action="store_true")
    args = ap.parse_args()

    if args.summarize_only:
        summarize(args.csv)
        return 0
    try:
        configs = parse_configs(args.configs)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 2
    size = None if args.size == "orig" else int(args.size)
    samples = read_samples(args.csv)
    ids = {t.strip() for t in args.samples.split(",") if t.strip()}
    if ids:
        samples = [s for s in samples if s["sample_id"] in ids]
    plan, missing = build_plan(samples, configs, args.repeats, size)
    print_plan(plan, missing, size)
    if not args.yes:
        return 0
    if not plan:
        print("実行する呼び出しがない。")
        return 1
    run(samples, configs, args.repeats, size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
