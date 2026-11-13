# 仕様とテストの対応（トレーサビリティ）

> ステータス: Draft
> 最終更新: 2026-11-14
> 関連: TST-02, TST-10, [strategy.md](strategy.md)

## 1. 規約

| 仕様の ID | どこで決める | テストへの付け方 |
|---|---|---|
| `DM-xx` | [domain-model.md](../02_design/domain-model.md) §6 | Python: `@pytest.mark.spec("DM-03")` |
| `F-xxx` / `F-xxx-yy` | [features/](../01_requirements/features/README.md)（要件 `F-xxx-yy` は機能ごとの詳細仕様に書く） | Python: `@pytest.mark.spec("F-030-02")`。アプリ（TypeScript）: テスト名の先頭に `[F-020-03]` と書く（集計は TEC-08 の後に足す） |
| `NFR-xxx` | [non-functional.md](../01_requirements/non-functional.md) | `@pytest.mark.spec("NFR-003")`（集計の対象は今後足す） |

- 1つのテストに複数の ID を付けてよい。パラメータ違い（`parametrize`）は1つのテストとして数える
- `pytest.ini` 相当の設定（ルートの `pyproject.toml`）で `--strict-markers` にしているので、`spec` の書き間違いは収集の時点でエラーになる
- 実際の Claude API を呼ぶテストには `@pytest.mark.live` を付ける。既定では動かない（`-m live` で動かす）

## 2. 対応表の作り方と検査

```bash
# 対応表（下の §3）を書き直す
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev python tools/trace.py"
# 検査だけ（抜け・仕様にない ID があれば終了コード 1。CI で使う）
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev python tools/trace.py --check"
```

- **DM はすべて必須**。どれかがテストに結びついていなければエラー
- **MVP の機能（F）は警告だけ**。画面の機能（F-010・F-014・F-020・F-021 など）は、アプリのテストができるまで「未」になる
- テストに付いた ID が仕様にない（書き間違い・廃止した ID）ときはエラー

## 3. 対応表（tools/trace.py が生成。手で直さない）

<!-- trace:begin -->

### ドメインのルール（DM、すべて必須）

| ID | ルール | テスト数 | テスト |
|---|---|---|---|
| DM-01 | `record_date` は、`eaten_at`（日本時間）から 4時間引い… | 4 | `tests/contract/test_api_contracts.py::test_create_request_builds_valid_meal`<br>`tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_record_date_boundary`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-02 | `totals` の各値は、食品の `nutrients` の和（null は … | 4 | `tests/contract/test_api_contracts.py::test_create_request_builds_valid_meal`<br>`tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_round1_is_half_up`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-03 | 食品の `nutrients` の各値は、`reference.nutrient… | 4 | `tests/contract/test_api_contracts.py::test_create_request_builds_valid_meal`<br>`tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_round1_is_half_up`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-04 | `portion.multiplier` は §2-3 の規則どおり | 5 | `tests/contract/test_api_contracts.py::test_create_request_builds_valid_meal`<br>`tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_expected_multiplier_modes`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules`<br>`tests/contract/test_domain_contracts.py::test_whole_multiplier` |
| DM-05 | `source.method` ごとの組み合わせ（§3）と、基準の種類: bar… | 2 | `tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-06 | `portion.mode = pieces` は基準が `per_piece`… | 3 | `tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_expected_multiplier_modes`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-07 | 食事の中で `item_id` は重複しない | 2 | `tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-08 | 食事には食品が1件以上ある（0件になったら食事ごと削除する、Q-31） | 2 | `tests/contract/test_domain_contracts.py::test_empty_meal_is_detected`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |
| DM-09 | 手入力（manual）の食品は、kcal・P・F・C のどれも null にしな… | 2 | `tests/contract/test_domain_contracts.py::test_domain_rules_detect_violations`<br>`tests/contract/test_domain_contracts.py::test_valid_example_follows_domain_rules` |

### MVP の機能（F）

| ID | 機能 | テスト数 | テスト |
|---|---|---|---|
| F-001 | サインイン・サインアウト | 1 | `tests/contract/test_api_contracts.py::test_operation_has_auth_and_error_responses` |
| F-010 | 入力方式の選択 | 0（未） | — |
| F-011 | バーコード照合 | 1 | `tests/contract/test_api_contracts.py::test_estimate_examples_follow_api_rules` |
| F-012 | 栄養成分表示の読み取り | 1 | `tests/contract/test_api_contracts.py::test_estimate_examples_follow_api_rules` |
| F-013 | 写真からの推定 | 1 | `tests/contract/test_api_contracts.py::test_estimate_examples_follow_api_rules` |
| F-014 | 手入力 | 0（未） | — |
| F-020 | 確認・修正画面 | 1 | `tests/contract/test_api_contracts.py::test_default_portion_rule` |
| F-021 | 読み取れないときの案内 | 0（未） | — |
| F-030 | 食事への追加・保存 | 2 | `tests/contract/test_api_contracts.py::test_add_item_request_builds_valid_meal`<br>`tests/contract/test_api_contracts.py::test_create_request_builds_valid_meal` |
| F-031 | 日次合計と食事一覧 | 1 | `tests/contract/test_api_contracts.py::test_meal_responses_follow_domain_rules` |
| F-032 | 食事・食品の削除 | 1 | `tests/contract/test_api_contracts.py::test_meal_responses_follow_domain_rules` |

<!-- trace:end -->
