# Claude API 契約（contracts/llm）

> 関連: ADR-0001、roadmap LLM-03〜LLM-07、TST-03

## 用途

| ディレクトリ | 機能 | 入力 | 状態 |
|---|---|---|---|
| `nutrition-label-ocr/` | ② 栄養成分表示 OCR | 画像 | 出力 v0.3・prompt 0.2.0（PoC-2 の結果で改訂。[ADR-0010](../../docs/adr/0010-label-ocr-model-and-image-size.md)） |
| `food-photo-estimate/` | ③ 写真からの推定 | 画像 | v0.1（PoC-3 で検証。[ADR-0011](../../docs/adr/0011-food-photo-model.md)） |

① バーコード照合と ④ 手入力は Claude を使わない（④ は [ADR-0012](../../docs/adr/0012-manual-text-input.md)。以前あった `text-estimate/` は削除した）。

## 各ディレクトリのファイル

| ファイル | 内容 |
|---|---|
| `input.schema.json` | 推定モジュールが受け取る入力 |
| `output.schema.json` | Claude に Structured Outputs で強制する出力（**完全版**。数値の下限などの制約も含む） |
| `prompt.md` | システムプロンプトとバージョン（`prompt_version`） |
| `examples/valid/` | スキーマに**適合する**例。`input-*.json` / `output-*.json` |
| `examples/invalid/` | スキーマに**適合しない**例。ファイル名に違反の内容を書く（例: `output-negative-kcal.json`） |

## 出力スキーマのルール（Structured Outputs との互換）

Claude の Structured Outputs で使える JSON Schema には制限がある。出力スキーマは次を守る（契約テストで検査する）。

1. すべての object に `"additionalProperties": false` を付ける
2. すべての object で、`properties` のキーを全部 `required` に入れる。値がないときは `null` を許す（`"type": ["number", "null"]`）
3. 使ってよいキーワード: `type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, `anyOf`, `allOf`, `$ref`, `$defs`, `description`, `title`, `$schema`, `$id`, `format`
4. 数値・文字列の制約（`minimum`, `maximum`, `minLength`, `maxLength`）は書いてよい。API には送られない（SDK が取り除いて送り、受け取った出力をクライアント側で検証する）が、完全版のスキーマとしてコード側の検証に使う
5. 再帰する `$ref` は使わない
6. **null を許す enum は `anyOf` で書く**（例: `{"anyOf": [{"type": "string", "enum": ["g", "ml"]}, {"type": "null"}]}`）。`"type": ["string", "null"]` と `enum` の組み合わせは API に 400 で拒否される（2026-11-13、PoC-2 で確認）

## スキーマで表せない意味上のルール

次は JSON Schema では表していない。推定モジュールのコードで検証する（実装時にテストを書く）。契約テストでは同じルールを `tests/contract/conftest.py` の `semantic_errors` で表し、valid の例が満たすことと、違反を検出できることを確かめている。

- `status` が `ok` 以外なら、`items` は空配列、`meal_name` は `null`（写真）
- OCR:
  - `status` が `ok` なら `columns` は1件以上で、各列の `nutrients.energy_kcal` は null 以外
  - `status` が `ok` 以外なら `columns` は空配列
  - 列が2件以上なら `issues` に `multiple_labels` を含む
  - `basis.type` が `per_piece` なら `basis.amount` と `basis.unit` は null（Haiku 5.5 で null と 1 が揺れたため、2026-11-13）
- 食事の合計値は Claude に出させず、`items` からコードで計算する

追加を検討中（PoC の結果を見て決める）:
- OCR の `basis.type` と `basis.unit` の組み合わせ（`per_100g` → `g`、`per_100ml` → `ml`）
- OCR の複数列の関係（味違いか基準違いか）を出力に持たせるか。今は持たせず、確認画面で利用者が列を選ぶ（Q-26）
- 写真の品目の栄養値は null を許していない（推定が難しくても値を出させ、`confidence` を `low` にする設計）。この扱いでよいかを PoC で確認する

## バージョン

- スキーマの `$id` の末尾（`v0.1`）と、`prompt.md` の `prompt_version` で管理する
- 推定結果を保存するときは、モデルID・`prompt_version`・スキーマのバージョンを一緒に記録する（LLM-07, DAT-05）
