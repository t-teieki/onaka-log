# スタック横断テスト

- `contract/` 契約（contracts/）の例がスキーマに適合するかの検証（TST-03）
- `e2e/` E2E（TST-08）
- `eval/` LLM 精度評価。通常CIとは分離（TST-07）

各アプリの単体テストは各アプリ内に置く。層ごとの方針は [docs/03_testing/strategy.md](../docs/03_testing/strategy.md)、仕様の ID の付け方（`@pytest.mark.spec`）は [traceability.md](../docs/03_testing/traceability.md)。実 API を呼ぶテストは `@pytest.mark.live` を付け、既定では動かさない。
