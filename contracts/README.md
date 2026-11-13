# contracts — 機械可読な契約（SSOT）

- `domain/`: ドメインオブジェクト（Meal / FoodItem / Nutrition 等）の JSON Schema
- `llm/<usecase>/`: Claude API 用途ごとの `input.schema.json` / `output.schema.json` / `prompt.md` / `examples/{valid,invalid}/`
- `api/`: アプリ⇔バックエンドの OpenAPI 3.1（`openapi.yaml`）と例

変更したら `tests/contract/` の検証が通ることを確認する。詳細: roadmap LLM-03, TST-03
