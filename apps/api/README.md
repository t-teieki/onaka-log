# onaka-api（バックエンド）

Python / FastAPI（Lambda Web Adapter で Lambda 上で動かす、ADR-0007）。実行時に `contracts/llm` のスキーマを読む（場所は環境変数 `ONAKA_CONTRACTS_DIR`、なければリポジトリの `contracts/`）。uv ワークスペースのメンバーで、依存はルートの `uv.lock` で管理する（ADR-0002）。

## 今あるもの

| 場所 | 中身 | 状態 |
|---|---|---|
| `src/onaka_api/domain/` | ドメインのルール（倍率・食べた量の値・合計・記録日・検証、DM-01〜09）。外部に依存しない | 実装済み |
| `src/onaka_api/estimation/` | Claude の出力・Open Food Facts の応答から候補（FoodItemDraft）を作る。出力は contracts/llm のスキーマと意味上のルールで検証（F-011・012・013） | 実装済み |
| `src/onaka_api/api/app.py` | FastAPI のアプリ（9つの API、利用者 ID、要求の検証、エラーの変換）。依存（保存先・Claude・OFF・時計）は `Deps` で渡す | 実装済み |
| `src/onaka_api/clients/` | Claude（`claude.py`）・Open Food Facts（`off.py`）の呼び出し | 実装済み |
| `src/onaka_api/repository/` | 保存先。DynamoDB（`dynamodb.py`）とメモリ（`memory.py`、テスト・ローカル用） | 実装済み |
| `src/onaka_api/settings.py`・`main.py` | 環境変数（`ONAKA_*`）の設定と、アプリの入口（`onaka_api.main:app`） | 実装済み |
| `tests/unit/domain/` | ドメインの単体テスト。正解は `contracts/domain/examples` | 42件 |
| `tests/unit/estimation/` | 候補の作り方の単体テスト。応答が OpenAPI の契約に合うこと、候補がドメインのルールを満たすことも確かめる | 38件 |
| `tests/unit/clients/`・`repository/`・`test_settings_and_main.py` | Claude・OFF の呼び出し（差し替え）、保存先（メモリと DynamoDB Local の両方で同じテスト）、設定と入口 | 41件 |
| `tests/api/` | API テスト（TestClient、保存先はメモリ）。応答を openapi.yaml で検証、実装の API の一覧が契約と一致することも確かめる（TST-06） | 31件 |
| `tests/fixtures/` | `llm/`: PoC で記録した Claude の実際の出力（画像は含まない）。`off/`: Open Food Facts の応答をまねた合成データ | — |
| `tests/api_test_helpers.py` | テストのヘルパー（`conftest.py` にしないのは、契約テストの `conftest` と名前がぶつかるため） | — |

## ローカルで動かす

```bash
# 保存先をメモリにして起動（再起動で消える）。利用者 ID は local-dev。Claude のキーは .env の ANTHROPIC_API_KEY を環境変数で渡す
wsl -e bash -lc "cd /mnt/c/project/onaka-log && ONAKA_REPOSITORY=memory ONAKA_LOCAL_USER_ID=local-dev UV_LINK_MODE=copy ~/.local/bin/uv run --group dev uvicorn onaka_api.main:app --reload"
```

設定は環境変数 `ONAKA_<項目名>`（[settings.py](src/onaka_api/settings.py)）。例: `ONAKA_TABLE_NAME`、`ONAKA_DYNAMODB_ENDPOINT`、`ONAKA_LABEL_MODEL`。Claude の API キーは `ANTHROPIC_API_KEY`、AWS 上は SSM Parameter Store（`ONAKA_CLAUDE_API_KEY_PARAM` に名前）。

## コマンド（WSL、リポジトリのルートで）

```bash
# 単体テスト
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev pytest apps/api/tests -q"
# lint・整形・型（dev グループはルートにあるので、ルートから apps/api を指す）
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev ruff check apps/api && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev ruff format --check apps/api"
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev mypy --config-file apps/api/pyproject.toml apps/api/src"
# DynamoDB Local でも保存先のテストを動かす（指定しなければ DynamoDB の分は skip）
wsl -e bash -lc "docker run -d --name onaka-ddb -p 8000:8000 amazon/dynamodb-local"
wsl -e bash -lc "cd /mnt/c/project/onaka-log && ONAKA_TEST_DYNAMODB_ENDPOINT=http://localhost:8000 UV_LINK_MODE=copy ~/.local/bin/uv run --group dev pytest apps/api/tests -q"
wsl -e bash -lc "docker rm -f onaka-ddb"
```

CI は `.github/workflows/api.yml`（[ci-cd.md](../../docs/04_operations/ci-cd.md)）。
