# ドメイン契約（contracts/domain）

> 関連: DAT-01, [docs/02_design/domain-model.md](../../docs/02_design/domain-model.md), [docs/02_design/data-model.md](../../docs/02_design/data-model.md), [ADR-0013](../../docs/adr/0013-data-model-keys-and-ids.md)

| ファイル | 内容 |
|---|---|
| `meal.schema.json` | 食事（Meal）と、その中の食品（FoodItem）。DynamoDB の食事アイテムのドメイン部分と、API で受け渡す形の正 |
| `examples/valid/meal-*.json` | スキーマとドメインのルール（DM-01〜DM-08）の両方を満たす例 |
| `examples/invalid/meal-*.json` | スキーマに適合しない例。ファイル名に違反の内容を書く |

- 例ファイル名の先頭（`meal-`）で、対応するスキーマ（`meal.schema.json`）を決める
- スキーマで表せないルール（合計・倍率・記録日など）は [domain-model.md](../../docs/02_design/domain-model.md) §6 にあり、参照実装は `tests/contract/domain_rules.py`。バックエンドでも同じルールで検証する
- 名前は snake_case（`contracts/llm` と同じ）
- バージョンは `$id` の末尾（`v0.1`）で管理する。属性を変えたら上げる
