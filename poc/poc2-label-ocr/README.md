# PoC-2 栄養成分表示 OCR

栄養成分表示の写真を Claude Vision で読み取り、正解 CSV（`poc/samples/label/ground_truth.csv`）と突き合わせる評価スクリプト。計画は [../README.md](../README.md) §3 PoC-2、§8。

- `run.py`: 実行 CLI。`score.py`: 採点の純粋関数。共通処理は `poc/shared/`
- 画像はメモリ上で縮小・JPEG 化するだけで、ディスクに書かない（ADR-0004）

## dry-run（既定。API は呼ばない）

```bash
uv run --group poc python poc/poc2-label-ocr/run.py                      # 3モデル × effort low,medium × 元サイズ
uv run --group poc python poc/poc2-label-ocr/run.py --models claude-sonnet-5-5 --efforts medium --sizes 768,1024
```

呼び出しの一覧と概算費用（円）を表示して終了する。出力 2000 トークン/回（thinking 込み）の保守的な仮定。

## 実行（費用が発生する。ユーザーの了承を得てから）

`.env` に `ANTHROPIC_API_KEY` を置き、同じコマンドに `--yes` を付ける。

| 実行 | コマンド |
|---|---|
| ① モデル比較 | `run.py --yes`（既定: 3モデル × `low,medium` × 元サイズ） |
| ② 画像サイズ比較 | `run.py --models claude-sonnet-5-5 --efforts medium --sizes 768,1024 --yes` |

オプション: `--models` / `--efforts` / `--sizes`（長辺 px。`orig` は縮小なし）/ `--samples L001,L002` / `--csv PATH`。
モデルは順番に1回ずつ呼ぶ。リフューザル時のフォールバックはしない（`stop_reason` が `refusal` / `max_tokens` ならエラー結果として記録）。

## 出力（`poc/results/poc2/`、Git 管理外）

- `results.jsonl`: 1呼び出し1行（画像データは含めない）。サンプルID・モデル・effort・画像サイズ・トークン数・応答時間・費用・出力 JSON・採点結果・エラー
- `summary.md`: 設定（モデル × effort × 画像サイズ）ごとの正答率表、サンプルごとの予測と正解、総費用
- `uv run --group poc python poc/poc2-label-ocr/run.py --summarize-only` で JSONL から summary を作り直す（API は呼ばない）

## 採点

kcal・P・F・C は両方が非 null で差が 0.05 以内なら正解（null は不正解）。基準量は数値・単位が一致し、`type` は正解が `per_package` なら `per_serving` / `per_piece` も許容（`per_100g` / `per_100ml` は完全一致）。内容量は数値・単位の一致。完全版スキーマの検証と、`status` が `ok` なら `energy_kcal` 非 null かつ `basis.type` が `unknown` 以外、という意味ルールも記録する。

## テスト（API 不要）

```bash
uv run --group dev --group poc pytest poc/shared poc/poc2-label-ocr -q
```
