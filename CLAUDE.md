# onaka-log — Claude Code 向けガイド

食品のカロリー・PFC（タンパク質・脂質・炭水化物）を推定・記録し、1日の摂取量と推移を確認するスマホアプリ。
入力方式: ①バーコード照合 ②栄養成分表示OCR ③食品写真からAI推定 ④テキスト入力。Claude API を適所で使う。
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
3. **テスト**: 仕様IDに紐づくテストを先に書き、赤（失敗）を確認する
4. **実装**: テストが緑になるまで実装する
- 実装フェーズでは **テストと契約を変更しない**。変更が必要と判断したら手を止め、ユーザーに確認し、仕様 → 契約 → テストの順に更新する。
- 重要な決定は `docs/adr/` に ADR として残す。未決事項は推測で埋めず `open-questions.md` に積む。
- Claude API の入出力は必ず `contracts/llm/<usecase>/` のスキーマで定義し、スキーマ検証テストを用意する。

## 規約

- ディレクトリ名・ファイル名は英語（ASCII）。ドキュメント本文は日本語。コード識別子は英語。
- ID体系: 機能 `F-xxx`、非機能 `NFR-xxx`、ADR `ADR-xxxx`、ロードマップ項目 `PRJ-01` 等、未決事項 `Q-xx`。採番済みIDは再利用しない。
- 図は Mermaid。
- フォルダ構成と置き場所のルール: [docs/00_project/folder-structure.md](docs/00_project/folder-structure.md)
- ドキュメント索引: [docs/README.md](docs/README.md)
- `old/` は旧資料。参考にはしてよいが更新しない・前提にしない。

## 現時点で未決（決まったら更新）

- 技術スタック（モバイル・バックエンド・DB）、利用者範囲、認証方式、インフラ → roadmap の ★ 項目参照
- そのためビルド・テスト実行コマンドはまだない
