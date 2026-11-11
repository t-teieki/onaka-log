# Claude API 契約（contracts/llm）

> 関連: ADR-0001、roadmap LLM-03〜LLM-07、TST-03

## 用途

| ディレクトリ | 機能 | 入力 | 状態 |
|---|---|---|---|
| `nutrition-label-ocr/` | ② 栄養成分表示 OCR | 画像 | v0.1（PoC-2 で検証） |
| `food-photo-estimate/` | ③ 写真からの推定 | 画像 | v0.1（PoC-3 で検証） |
| `text-estimate/` | ④ テキスト入力による推定 | テキスト | v0.1（PoC-4 で検証） |

① バーコード照合は Claude を使わない。

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

## スキーマで表せない意味上のルール

次は JSON Schema では表していない。推定モジュールのコードで検証する（実装時にテストを書く）。

- `status` が `ok` 以外なら、`items` は空配列、`meal_name` は `null`（写真・テキスト）
- `status` が `ok` なら、`nutrients.energy_kcal` と `basis.type` は null / `unknown` 以外（OCR）
- 食事の合計値は Claude に出させず、`items` からコードで計算する

追加を検討中（PoC の結果を見て決める）:
- OCR の `basis.type` と `basis.unit` の組み合わせ（`per_100g` → `g`、`per_100ml` → `ml`）
- 写真・テキストの品目の栄養値は null を許していない（推定が難しくても値を出させ、`confidence` を `low` にする設計）。この扱いでよいかを PoC で確認する

## バージョン

- スキーマの `$id` の末尾（`v0.1`）と、`prompt.md` の `prompt_version` で管理する
- 推定結果を保存するときは、モデルID・`prompt_version`・スキーマのバージョンを一緒に記録する（LLM-07, DAT-05）
