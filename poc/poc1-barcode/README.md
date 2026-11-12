# PoC-1 バーコード照合（Open Food Facts）

`poc/samples/barcode/ground_truth.csv` の各 JAN を Open Food Facts（OFF）で引き、パッケージ表示（正解）と比べる。指標の定義は [poc/README.md](../README.md) §3。Claude API は使わない（費用ゼロ）。

## 実行

```bash
uv sync --group dev --group poc
uv run --group poc python poc/poc1-barcode/run.py            # キャッシュがあれば再利用
uv run --group poc python poc/poc1-barcode/run.py --refresh  # 再取得
uv run --group dev --group poc pytest poc/poc1-barcode/tests -q
```

## 比較のルール

- OFF の 100g 当たり値を、正解の `basis_amount` で換算して比較する（OFF の内容量は換算に使わない）。
- 許容誤差: kcal は max(5%, 5 kcal)、P/F/C は max(5%, 0.5 g)。
- kJ のみなら 4.184 で割って kcal にし、`energy_from_kj` を立てる。ml と g の違いは 1ml = 1g とみなし `unit_assumed_density_1` を立てる。
- 1包装・1食当たりの値しかない場合は比較せず `serving_only` とする。
- 20 件未満のときは採否の判定を保留する。

## ファイル

| ファイル | 内容 |
|---|---|
| `off_client.py` | OFF API 取得（User-Agent は汎用名、1秒間隔、リトライ2回、生 JSON をキャッシュ） |
| `evaluate.py` | 抽出・換算・許容判定・集計の純粋関数 |
| `run.py` | CLI。CSV 読み込み、取得、評価、出力 |
| `tests/test_evaluate.py` | `evaluate.py` の単体テスト |

## 出力（`poc/results/poc1/`、Git 管理外）

- `raw/{jan}.json`: OFF の生応答（キャッシュ）
- `results.jsonl`: 1サンプル1行の評価結果
- `summary.md`: 指標表・サンプル別表・注意（日本語）
