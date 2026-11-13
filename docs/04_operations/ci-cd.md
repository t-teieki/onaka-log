# CI/CD

> ステータス: Draft（契約テストのワークフローだけ。アプリ・デプロイは実装に合わせて足す）
> 最終更新: 2026-11-14
> 関連: CIC-01〜CIC-10, [strategy.md](../03_testing/strategy.md) §6, ADR-0014, ADR-0017

## 1. 今あるワークフロー

| ファイル | 名前 | いつ動く | やること |
|---|---|---|---|
| [.github/workflows/contract.yml](../../.github/workflows/contract.yml) | `contract` | `main` への push と pull request（下のパスが変わったとき）、手動 | ① `uv sync --locked`（dev・poc グループ） ② `pytest tests/contract poc`（実 API は呼ばない） ③ `tools/trace.py --check`（仕様とテストの対応） |

対象のパス: `contracts/`・`tests/`・`tools/`・`poc/`・`docs/01_requirements/`・`docs/02_design/`・`docs/03_testing/`（trace.py が仕様の ID を読むため）・`pyproject.toml`・`uv.lock`・`.python-version`・ワークフロー自身。

## 2. 決めたこと

- **GitHub Actions** を使う（CIC-01）
- **Action はコミットの SHA で固定する**（タグの付け替えによる改ざんを防ぐ）。版はコメントに書く。更新は Dependabot で行う予定（CIC-08）
- **権限は最小**（`contents: read`）。チェックアウトの認証情報は残さない（`persist-credentials: false`）
- **依存は `uv.lock` どおり**（`--locked`。ロックと pyproject.toml がずれていたら失敗する）
- 同じブランチで新しい実行が始まったら古い実行を止める（`concurrency`）
- シークレットは使わない（実 API のテストは CI の既定で動かさない。strategy.md §3-2）

## 3. 今後足すもの

| 時期 | ワークフロー | 中身 |
|---|---|---|
| バックエンドの実装開始時 | `api` | Ruff・mypy・`apps/api/tests`（DynamoDB Local をサービスコンテナで）。`contracts/` の変更でも動かす（CIC-03） |
| アプリの実装開始時 | `mobile` | TypeScript の型検査・ESLint・Jest。`contracts/api/` の変更でも動かす |
| インフラを書いたとき | `infra` | `sam validate`・cfn-lint |
| dev 環境ができたとき | `deploy-dev` | `main` へのマージで dev にデプロイ（OIDC、CIC-05・CIC-09） |
| 必要になったら | `live`（手動） | 実 API のスモーク（`-m live`）。キーは GitHub の Environment のシークレットに置き、費用の上限を決める（CIC-04） |
| 早めに | Dependabot | GitHub Actions・uv・npm の依存更新（CIC-08） |

## 4. ローカルで同じことをする

```bash
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev --group poc pytest tests/contract poc -q"
wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev python tools/trace.py --check"
```

ワークフローの書き方の検査（actionlint を Docker で）:

```bash
wsl -e bash -lc 'cd /mnt/c/project/onaka-log && docker run --rm -v "$PWD:/repo:ro" -w /repo rhysd/actionlint:latest .github/workflows/contract.yml'
```
