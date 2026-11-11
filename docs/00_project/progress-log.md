# 進捗ログ（セッション引継ぎ）

> 新しいエントリを **上に** 追記する。1セッション1エントリ。
> 書くこと: やったこと / 決まったこと（ADRリンク）/ 次にやること / 注意点・気づき。

---

## 2026-11-11 セッション1: ゼロベースで計画の土台を作成

**やったこと**
- 既存ドキュメント（機能要件仕様書・フロー/アーキテクチャ・PoC計画）を `old/` へ移動。ゼロベースで再検討する
- フォルダ構成の初版を作成 → [folder-structure.md](folder-structure.md)
- 全体ロードマップ兼チェックリストを作成 → [roadmap.md](roadmap.md)（約170項目、カテゴリ別ID付き）
- 外部記憶の仕組みを整備: CLAUDE.md / roadmap / progress-log / open-questions / ADR / `/handoff` skill

**決まったこと**
- 開発プロセス: 仕様駆動＋テスト駆動 → [ADR-0001](../adr/0001-spec-driven-and-test-driven.md)
- フォルダ構成・モノレポ（提案段階） → [ADR-0002](../adr/0002-monorepo-and-folder-structure.md)

**次にやること**
1. [open-questions.md](open-questions.md) の 🔴 項目（Q-01〜Q-03）にユーザー回答をもらう
2. PRJ-01: リポジトリ独立化（Q-02 の回答次第）
3. M1: REQ-01〜REQ-04（利用者範囲・ビジョン・MVPスコープ）と DAT-01（ドメインモデル骨格）
4. 並行して M2 の準備: POC-01（PoC計画）・POC-03（サンプル収集）・LLM-03（スキーマ初版）

**注意点・気づき**
- 現在 git のルートは `C:/project`（他プロジェクトと同居）。`onaka-log` はまだ未コミット
- `old/` の旧資料には有用な知見あり（例: バーコード/OCR の値が 100g 基準か1食基準かで実摂取量がずれる問題、Open Food Facts の国内カバレッジ不安）。再検討時に参照可
- Claude モデル候補（2026-11 時点）: Haiku 5.5 / Sonnet 5.5 / Opus 5.5。出力の JSON 強制は Structured Outputs（`output_config.format`）または strict tool use。Opus 5.5 / Sonnet 5.5 は forced tool_choice 非対応なので注意
