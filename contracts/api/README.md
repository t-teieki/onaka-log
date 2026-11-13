# API 契約（contracts/api）

> 関連: ARC-04, ARC-08, ARC-09, [docs/02_design/api.md](../../docs/02_design/api.md), [ADR-0016](../../docs/adr/0016-api-rest-openapi.md)

| ファイル | 内容 |
|---|---|
| `openapi.yaml` | アプリ ⇔ バックエンドの API（OpenAPI 3.1）。食品の形は `../domain/meal.schema.json`、画像の入力は `../llm/*/input.schema.json` を参照する |
| `examples/valid/<スキーマ名>-*.json` | `components.schemas` の該当スキーマに適合する例。API のルール（api.md）とドメインのルールも満たす |
| `examples/invalid/<スキーマ名>-*.json` | 適合しない例。ファイル名に違反の内容を書く |

- 例ファイル名の先頭（例: `MealCreateRequest-`）で、検証に使う `components.schemas` を決める
- スキーマで表せないルール（候補の分量の既定、推定結果の status と候補の数、日次合計など）の参照実装は `tests/contract/api_rules.py`
- 版は `info.version` とパスの `/v1` で管理する（ADR-0016）
