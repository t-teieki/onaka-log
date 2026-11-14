# onaka-api（バックエンド）

Python / FastAPI（Lambda Web Adapter で Lambda 上で動かす、ADR-0007）。uv ワークスペースのメンバーで、依存はルートの `uv.lock` で管理する（ADR-0002）。

## 今あるもの

| 場所 | 中身 | 状態 |
|---|---|---|
| `src/onaka_api/domain/` | ドメインのルール（倍率・食べた量の値・合計・記録日・検証、DM-01〜09）。外部に依存しない | 実装済み |
| `src/onaka_api/routers/` ほか | API・推定・照合・DynamoDB | 未作成 |
| `tests/unit/domain/` | ドメインの単体テスト。正解は `contracts/domain/examples` | 42件 |
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
