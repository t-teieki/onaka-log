# onaka-log — Claude Code 向けガイド

食品のカロリー・PFC（タンパク質・脂質・炭水化物）を推定・記録し、1日の摂取量と推移を確認するスマホアプリ。
入力方式: ①バーコード照合 ②栄養成分表示OCR ③食品写真からAI推定 ④手入力（食品名と数値。他の方式が使えないときの最後の手段）。Claude API は②③で使う。
記録単位: **食事（Meal）1件に食品（FoodItem）N件** を紐づけ、食品ごとと食事合計の両方の値を持つ。

## セッション開始時に必ず読む

1. [docs/00_project/roadmap.md](docs/00_project/roadmap.md) の「現在地」とチェック状態
2. [docs/00_project/progress-log.md](docs/00_project/progress-log.md) の最新エントリ（前回の引継ぎ）
3. [docs/00_project/open-questions.md](docs/00_project/open-questions.md)（ユーザー判断待ち）
4. 作業対象に関係する `docs/` と `contracts/` のファイル

読んだら、作業前に「現在地と今回やること」を1〜2行でユーザーに確認する。

## セッション終了時（または区切り）に必ずやる

`/handoff` skill を実行する（roadmap のチェック更新・progress-log 追記・open-questions 更新）。

## 開発プロセス（仕様駆動 + テスト駆動）

1. **仕様**: `docs/01_requirements/`（What）→ `docs/02_design/`（How）
2. **契約**: `contracts/` に JSON Schema / OpenAPI として機械可読化（SSOT）
3. **テスト**: 仕様IDに紐づくテストを先に書き（`@pytest.mark.spec("DM-03")` など、[traceability.md](docs/03_testing/traceability.md)）、赤（失敗）を確認する。層ごとの方針は [strategy.md](docs/03_testing/strategy.md)
4. **実装**: テストが緑になるまで実装する
- 実装フェーズでは **テストと契約を変更しない**。変更が必要と判断したら手を止め、ユーザーに確認し、仕様 → 契約 → テストの順に更新する。
- 重要な決定は `docs/adr/` に ADR として残す。未決事項は推測で埋めず `open-questions.md` に積む。
- Claude API の入出力は必ず `contracts/llm/<usecase>/` のスキーマで定義し、スキーマ検証テストを用意する。

## 規約

- ディレクトリ名・ファイル名は英語（ASCII）。ドキュメント本文は日本語。コード識別子は英語。
- ID体系: 機能 `F-xxx`、非機能 `NFR-xxx`、ADR `ADR-xxxx`、ロードマップ項目 `PRJ-01` 等、未決事項 `Q-xx`。採番済みIDは再利用しない。
- 図は Mermaid。AWS の構成図だけは公式アイコンを使うため、Python の `diagrams` で PNG を作る（元のコード: [docs/02_design/diagrams/architecture.py](docs/02_design/diagrams/architecture.py)）。
- フォルダ構成と置き場所のルール: [docs/00_project/folder-structure.md](docs/00_project/folder-structure.md)
- ドキュメント索引: [docs/README.md](docs/README.md)
- 旧資料（`old/`）は削除済み。必要ならコミット `dbe0211` 以前の Git 履歴から参照できる（前提にはしない）。

## 決定済みの前提

- 直近は自分専用、将来はストア公開。Claude API はバックエンド経由で呼ぶ（[ADR-0003](docs/adr/0003-phased-release-design.md)）
- 撮影画像は保存しない。ログにも残さない（[ADR-0004](docs/adr/0004-no-image-retention.md)）
- 分量は人が入力せず読み取りで決める。1日の境界は 4:00（[scope.md](docs/01_requirements/scope.md)）
- 運用コストは月1000円まで。対象は iOS・Android（実機は iOS のみ）（[non-functional.md](docs/01_requirements/non-functional.md)）
- MVP の入力方式は手入力も含めた4つ（手入力は Claude を使わない、[ADR-0012](docs/adr/0012-manual-text-input.md)）。分量の既定は「全部食べた」＋ワンタップで修正
- モバイルは React Native（Expo）+ TypeScript（[ADR-0005](docs/adr/0005-mobile-react-native-expo.md)）。ライブラリ・道具は [ADR-0017](docs/adr/0017-libraries-and-tooling.md)。Apple Developer Program は最低優先で、開発は Android エミュレーター中心（iPhone は Expo Go で確認）
- 認証は最初から入れる、Sign in with Apple + Google（[ADR-0006](docs/adr/0006-auth-from-day-one.md)）
- 開発は WSL から、リポジトリは C ドライブ上。性能などが問題になりそうなら WSL 側へ移す（[dev-environment.md](docs/00_project/dev-environment.md)）
- バックエンドは AWS サーバーレス: API Gateway + Lambda（Python / FastAPI）+ Cognito、東京リージョン（[ADR-0007](docs/adr/0007-backend-aws-serverless.md)）
- IaC は AWS SAM、環境は local / dev / prod（[ADR-0014](docs/adr/0014-iac-aws-sam.md)）。記録はサーバーファースト、推定は同期 API、計算はバックエンド（[ADR-0015](docs/adr/0015-server-first-and-sync-estimation.md)）。全体構成: [architecture.md](docs/02_design/architecture.md)
- API は REST + OpenAPI 3.1、パスで版を分ける（`/v1`）。契約は [contracts/api/openapi.yaml](contracts/api/openapi.yaml)、方針は [api.md](docs/02_design/api.md)（[ADR-0016](docs/adr/0016-api-rest-openapi.md)）
- DB は DynamoDB（[ADR-0008](docs/adr/0008-database-dynamodb.md)）。キー・ID・値の持ち方は [ADR-0013](docs/adr/0013-data-model-keys-and-ids.md)、形は [contracts/domain/meal.schema.json](contracts/domain/meal.schema.json)

## 現時点で未決（決まったら更新）

- アプリ（モバイル）のビルドコマンドはまだない。バックエンドは API まで実装済み（ローカルの起動は [apps/api/README.md](apps/api/README.md)）。AWS へのデプロイ（SAM）は未作成

## コマンド

- 契約テスト（`contracts/` を変更したら必ず実行。WSL の uv を使う）:
  `wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev pytest tests/contract -q"`
- 仕様とテストの対応の検査（テストを足したら実行。DM の抜けや仕様にない ID があれば失敗する）:
  `wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev python tools/trace.py --check"`
- バックエンドのテスト・lint・型（ルートから。詳細は [apps/api/README.md](apps/api/README.md)）:
  `wsl -e bash -lc "cd /mnt/c/project/onaka-log && UV_LINK_MODE=copy ~/.local/bin/uv run --group dev pytest apps/api/tests -q"`
- CI（GitHub Actions）: `.github/workflows/contract.yml` が契約テスト・PoC の単体テスト・trace.py --check を、`api.yml` がバックエンドの Ruff・mypy・単体テストを動かす（[ci-cd.md](docs/04_operations/ci-cd.md)）。Action は SHA で固定する
- ファイルは UTF-8（BOM なし）・LF で書く。PowerShell の `Set-Content` / `Out-File` は BOM を付けるので使わない
