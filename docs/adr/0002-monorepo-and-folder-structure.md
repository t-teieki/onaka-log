# ADR-0002: モノレポとフォルダ構成

- ステータス: Accepted（2026-11-14。技術スタックの決定 ADR-0005・0007・0014 を受けて `apps/` `infra/` を確定）
- 日付: 2026-11-11（提案）、2026-11-14（確定）
- 関連: PRJ-05, PRJ-06, ADR-0005, ADR-0007, ADR-0014, ADR-0016, [folder-structure.md](../00_project/folder-structure.md)

## 背景

仕様・契約・PoC・モバイル・バックエンド・インフラを並行して扱う。契約の変更がアプリ双方とテストに確実に伝わる必要がある。2026-11-11 の時点では技術スタックが未決だったため、トップレベルだけを決めて Proposed にしていた。モバイル（Expo + TypeScript）、バックエンド（Python / FastAPI on Lambda）、IaC（AWS SAM）、API（OpenAPI）が決まったので、`apps/` 以下と `infra/` を確定する。

## 選択肢

| 論点 | 選択肢 | 選んだもの |
|---|---|---|
| リポジトリ | モノレポ / 分割 | モノレポ（契約の変更を1つのコミットで全体に反映し、CI でまとめて検証できる） |
| Python の管理 | アプリごとに別の環境 / uv のワークスペース | **uv のワークスペース**。ルートの `pyproject.toml` をワークスペースのルートにし、`apps/api` をメンバーにする。ロックファイル（`uv.lock`）は1つ |
| バックエンドのコード | フラット / `src/` 形式 | `apps/api/src/onaka_api/`（`src/` 形式。テストが入れたパッケージを使うようにする） |
| JavaScript のパッケージ管理 | npm / pnpm / yarn | **npm**（Expo の既定。JavaScript のパッケージは `apps/mobile` の1つだけなのでワークスペース機能は要らない） |
| 共有ライブラリ（`packages/`） | 作る / 作らない | 作らない。契約は `contracts/` が正で、Python はバックエンドの中で、TypeScript の型は OpenAPI からアプリの中に生成する |

## 決定

モノレポ。構成と置き場所のルールは [folder-structure.md](../00_project/folder-structure.md) を正とする。要点:

- `apps/api/`: バックエンド（FastAPI）。ドメインのルール・推定・照合・保存。単体テストは `apps/api/tests/`
- `apps/mobile/`: Expo アプリ（TypeScript、npm）。API のクライアントは `contracts/api/openapi.yaml` から生成する
- `infra/`: AWS SAM のテンプレートと環境ごとの設定
- `contracts/`: スキーマと OpenAPI（SSOT）。バックエンドは実行時に `contracts/llm` のプロンプト・スキーマを読むので、ビルド時に同梱する
- `tests/`: スタックをまたぐテスト（契約・E2E・LLM の回帰評価）

## 見直す条件

チーム開発になった場合、またはモバイルとバックエンドのリリース周期が大きく離れた場合。JavaScript のパッケージが増えたら npm のワークスペース（または pnpm）を検討する。
