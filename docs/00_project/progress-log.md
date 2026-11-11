# 進捗ログ（セッション引継ぎ）

> 新しいエントリを **上に** 追記する。1セッション1エントリ。
> 書くこと: やったこと / 決まったこと（ADRリンク）/ 次にやること / 注意点・気づき。

---

## 2026-11-11 セッション1（続き）: 未決事項 Q-01〜Q-10 の回答を反映

**やったこと**
- Q-01〜Q-10 の回答を open-questions に記録し、そこから出てきた論点を Q-11〜Q-19 として追加
- 要件ドキュメントの初版: [scope.md](../01_requirements/scope.md)・[non-functional.md](../01_requirements/non-functional.md)（Draft）
- roadmap を更新（M1 へ移行。TEC-12〜14、REQ-23・REQ-24 を追加）
- `.gitattributes` を追加（Windows と WSL を併用するため改行コードを LF に統一）

**決まったこと**
- 直近は自分専用、将来はストア公開 → 最初から公開仕様で作る部分を整理 → [ADR-0003](../adr/0003-phased-release-design.md)（Claude はバックエンド経由で呼ぶ、user_id 前提）
- 撮影画像は保存しない（ログにも残さない） → [ADR-0004](../adr/0004-no-image-retention.md)
- MVP の入力方式: バーコード・OCR・写真推定。分量は人が入力せず読み取りで決める。1日の境界は 4:00
- 運用コストは月1000円まで（NFR-001）。自分専用なら Sonnet 5.5 でも月約400円の見込み

**次にやること**
1. Q-11（モバイル: React Native + Expo を推奨）・Q-12（バックエンド: Supabase を推奨）を決める → ADR 化（TEC-01, ARC-03）
2. Q-14〜Q-17 を決めて scope.md を確定（REQ-04, REQ-23, REQ-24）
3. DAT-01 ドメインモデルの骨格
4. POC-01 PoC 計画、LLM-03 スキーマ初版（PoC の Python 環境は WSL 想定）

**注意点・気づき**
- リポジトリはユーザーが既に独立化し、GitHub（`t-teieki/onaka-log`）へ push 済みだった
- 手元に Mac がないため、iOS のビルドはクラウドビルドが前提（TEC-12）。iPhone 実機に独自ビルドを入れるには Apple Developer Program（年 $99）が必要になる場面がある（Q-13）
- 分量を自動で決めるには「内容量」が取れることが重要 → PoC の計測項目に追加（POC-12, POC-23）

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
