# 契約テスト（tests/contract）

`contracts/llm/` の Claude API 契約と、`contracts/domain/` のドメイン契約を検査する（roadmap TST-03、ADR-0001）。

- `test_llm_contracts.py`: Claude API 契約（下の「検査内容」）
- `test_api_contracts.py`: API 契約（`contracts/api/openapi.yaml`）。OpenAPI としての正しさ（openapi-spec-validator）、全 API が JWT 必須で共通のエラー応答を使うこと、エラーコードが api.md の表と一致すること、例の適合・不適合、API のルール（参照実装 `api_rules.py`）、保存 API の入力からバックエンドが作る食事がドメインのルールを満たすこと
- `test_domain_contracts.py`: ドメイン契約。スキーマの正しさ、valid / invalid の例、ドメインのルール DM-01〜DM-09（参照実装 `domain_rules.py`）を valid の例が満たすこと、ルールが違反を検出できること

## 検査内容

1. 各用途に `input.schema.json` / `output.schema.json` / `prompt.md` が揃い、`prompt.md` に `prompt_version: X.Y.Z` がある
2. すべてのスキーマが JSON Schema 2020-12 として正しい
3. `examples/valid/` の例はすべてスキーマに適合する
4. `examples/invalid/` の例はすべて不適合になる（1ファイル1違反、理由はファイル名）
5. 用途ごとに input / output それぞれ valid・invalid の例が1件以上ある
6. 出力スキーマが Structured Outputs 互換（全 object が `additionalProperties: false` かつ `required` = `properties`、許可キーワードのみ、再帰 `$ref` なし）。検査関数自体の自己テストも含む
7. README の意味上のルール（`status` が `ok` 以外なら `items` 空・`meal_name` が null、OCR は `ok` なら `energy_kcal` 非 null かつ `basis.type` が `unknown` 以外）を valid な出力例で確認

例ファイルの名前は `input-*.json` が input スキーマ、`output-*.json` が output スキーマに対応する。

## 実行

```bash
uv sync --group dev
uv run --group dev pytest tests/contract -q
```
