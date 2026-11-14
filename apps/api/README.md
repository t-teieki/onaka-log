# onaka-api（バックエンド）

Python / FastAPI（Lambda Web Adapter で Lambda 上で動かす、ADR-0007）。実行時に `contracts/llm` のスキーマを読む（場所は環境変数 `ONAKA_CONTRACTS_DIR`、なければリポジトリの `contracts/`）。uv ワークスペースのメンバーで、依存はルートの `uv.lock` で管理する（ADR-0002）。

## 今あるもの

| 場所 | 中身 | 状態 |
|---|---|---|
| `src/onaka_api/domain/` | ドメインのルール（倍率・食べた量の値・合計・記録日・検証、DM-01〜09）。外部に依存しない | 実装済み |
| `src/onaka_api/estimation/` | Claude の出力・Open Food Facts の応答から候補（FoodItemDraft）を作る。出力は contracts/llm のスキーマと意味上のルールで検証（F-011・012・013） | 実装済み（Claude・OFF の呼び出しは未作成） |
| `src/onaka_api/routers/`・`repository/` | API のルート・DynamoDB | 未作成 |
| `tests/unit/domain/` | ドメインの単体テスト。正解は `contracts/domain/examples` | 42件 |
| `tests/unit/estimation/` | 候補の作り方の単体テスト。応答が OpenAPI の契約に合うこと、候補がドメインのルールを満たすことも確かめる | 38件 |
| `tests/fixtures/` | `llm/`: PoC で記録した Claude の実際の出力（画像は含まない）。`off/`: Open Food Facts の応答をまねた合成データ | — |
| `tests/api_test_helpers.py` | テストのヘルパー（`conftest.py` にしないのは、契約テストの `conftest` と名前がぶつかるため） | — |

## コマンド（WSL、リポジトリのルートで）

```bash
# 単体テスト
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev pytest apps/api/tests -q"
# lint・整形・型（dev グループはルートにあるので、ルートから apps/api を指す）
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev ruff check apps/api && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev ruff format --check apps/api"
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev mypy --config-file apps/api/pyproject.toml apps/api/src"
```

CI は `.github/workflows/api.yml`（[ci-cd.md](../../docs/04_operations/ci-cd.md)）。
