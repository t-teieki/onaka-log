# フォルダ構成

> ステータス: **提案（Proposed）** — 技術スタック確定後に `apps/` 配下を具体化する（[ADR-0002](../adr/0002-monorepo-and-folder-structure.md)）。
> 最終更新: 2026-11-11

## 設計方針

1. **ドキュメントが一次情報**。コードより先に `docs/` と `contracts/` を書く（仕様駆動）。
2. **機械可読な契約（`contracts/`）を唯一の正（SSOT）とする**。Claude API の入出力、アプリ⇔バックエンドAPI、ドメインモデルは JSON Schema / OpenAPI で定義し、ドキュメント・テスト・実装はすべてそこを参照する。
3. **技術スタック非依存の骨格**。スタック未決定でも成立するトップレベル構成にし、決定後に `apps/` 配下を埋める。
4. **モノレポ**。仕様・契約・PoC・アプリ・インフラを1リポジトリに置き、契約変更が全体のテスト（CI）に即座に効くようにする。
5. **ディレクトリ名・ファイル名は英語（ASCII）**、ドキュメント本文は日本語。CLI・CI・シェルでのクォート問題を避けるため。
6. **セッション外部記憶は `docs/00_project/` に集約**（ロードマップ・進捗ログ・未決事項）。

## ツリー

```
onaka-log/
├── CLAUDE.md                     # Claude Code の入口。開発ルール・セッション開始/終了手順
├── README.md                     # 人間向けの概要
├── .gitignore
│
├── docs/                         # 仕様・設計（What / Why / How）
│   ├── README.md                 # ドキュメント索引・記法・ID体系
│   ├── 00_project/               # ★プロジェクト管理・外部記憶
│   │   ├── roadmap.md            #   全体ロードマップ兼チェックリスト（現在地もここ）
│   │   ├── progress-log.md       #   セッションごとの作業ログ・引継ぎ
│   │   ├── open-questions.md     #   ユーザー判断待ちの未決事項
│   │   ├── folder-structure.md   #   本ファイル
│   │   └── glossary.md           #   用語集（食事/食品/推定 など）
│   ├── 01_requirements/          # 要件（What）
│   │   ├── vision.md             #   目的・対象ユーザー・提供価値・非ゴール
│   │   ├── scope.md              #   MVP / 次期 / 将来 のスコープ分け
│   │   ├── features/             #   機能仕様（1機能1ファイル、ID: F-xxx）
│   │   └── non-functional.md     #   非機能要件（ID: NFR-xxx）
│   ├── 02_design/                # 設計（How）
│   │   ├── architecture.md       #   全体構成・レイヤ・コンポーネント
│   │   ├── domain-model.md       #   ドメインモデル（Meal / FoodItem ...）
│   │   ├── data-model.md         #   DBスキーマ・同期・マイグレーション方針
│   │   ├── auth.md               #   認証・認可
│   │   ├── infra.md              #   インフラ・環境・シークレット
│   │   ├── api.md                #   アプリ⇔バックエンドAPIの設計方針（契約本体は contracts/api）
│   │   ├── error-handling.md     #   エラー体系・エラーコード
│   │   ├── llm/                  #   Claude API 利用設計（用途ごと: プロンプト方針・モデル・評価）
│   │   └── screens/              #   画面一覧・遷移図・ワイヤーフレーム
│   ├── 03_testing/               # テスト戦略・トレーサビリティ・評価(eval)方針
│   ├── 04_operations/            # CI/CD・リリース・監視・運用手順
│   ├── adr/                      # Architecture Decision Records（決定の記録）
│   └── templates/                # 機能仕様・ADR・PoCレポートのテンプレート
│
├── contracts/                    # ★機械可読な契約（SSOT）。スタック非依存
│   ├── domain/                   #   ドメインオブジェクトの JSON Schema
│   ├── llm/                      #   Claude API 用途ごとの入出力スキーマ
│   │   └── <usecase>/            #     例: nutrition-label-ocr, food-photo-estimate, text-estimate
│   │       ├── input.schema.json      #   アプリ/バックエンド→LLM層へ渡す入力
│   │       ├── output.schema.json     #   LLMに強制する出力（Structured Outputs）
│   │       ├── prompt.md              #   システムプロンプト（バージョン付き）
│   │       └── examples/              #   valid/invalid の例（契約テストのフィクスチャ）
│   └── api/                      #   アプリ⇔バックエンド OpenAPI
│
├── tests/                        # スタック横断テスト（各アプリの単体テストは各アプリ内）
│   ├── contract/                 #   contracts/ の例がスキーマに適合するかの検証
│   ├── e2e/                      #   E2E（スタック決定後）
│   └── eval/                     #   LLM精度評価（通常CIとは分離、手動/定期実行）
│
├── poc/                          # PoC（機能1〜3）。使い捨て前提だが結果は docs に残す
│   ├── README.md
│   ├── shared/                   #   共通処理（Claude呼び出し・スキーマ検証）
│   ├── poc1-barcode/
│   ├── poc2-label-ocr/
│   ├── poc3-photo-estimate/
│   ├── samples/                  #   評価用サンプル（画像はGit管理外 or LFS、正解値CSVは管理）
│   └── reports/                  #   PoC結果レポート
│
├── apps/                         # プロダクトコード（スタック決定後に作成）
│   ├── mobile/                   #   スマホアプリ
│   └── api/                      #   バックエンド（BaaS採用時は functions 等に置換）
│
├── packages/                     # （必要になれば）共有ライブラリ・契約からの生成コード
├── infra/                        # IaC・環境定義
├── tools/                        # 開発補助スクリプト（コード生成・評価実行など）
├── .github/workflows/            # CI/CD
├── .claude/                      # Claude Code ハーネス（skills / settings / agents）
│   └── skills/handoff/           #   セッション終了時の引継ぎ手順
└── 議論/                         # 判断材料・比較検討の資料（決定前の議論。決定は ADR に書く）
    └── バックエンド構成/
```

> 旧資料を置いていた `old/` は 2026-11-12 に削除した。必要ならコミット `dbe0211` 以前の Git 履歴から参照できる。

> `議論/` はユーザーの指定により日本語名とする（方針5の例外）。

## 置き場所のルール

| 何を | どこに |
|---|---|
| 「何を作るか」 | `docs/01_requirements/` |
| 「どう作るか」 | `docs/02_design/` |
| 「なぜそう決めたか」 | `docs/adr/` |
| 機械が検証する約束事 | `contracts/` |
| まだ決まっていないこと | `docs/00_project/open-questions.md` |
| 決める前の比較・検討資料 | `議論/<テーマ>/` |
| 今どこまで進んだか | `docs/00_project/roadmap.md`（チェック）＋ `progress-log.md`（経緯） |
| 単体テスト | 各アプリ内（スタックの慣習に従う） |
| 契約テスト・E2E・LLM評価 | ルートの `tests/` |
