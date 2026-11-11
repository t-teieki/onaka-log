---
name: handoff
description: セッション終了時・区切りで、onaka-log の外部記憶（roadmap / progress-log / open-questions）を更新して次のセッションへ引き継ぐ。
---

# セッション引継ぎ

次のセッションが、この会話を見ずに作業を再開できる状態にする。以下を順に行う。

1. **roadmap.md を更新**（`docs/00_project/roadmap.md`）
   - 完了した項目を `[x]` に、着手中は末尾に `(WIP)` を付ける
   - 成果物ファイルを作ったらリンクを付ける
   - 冒頭「現在地」の表（現在のマイルストーン・次にやること・ブロッカー・最終更新日）を書き換える
2. **progress-log.md に追記**（`docs/00_project/progress-log.md`、最新を上に）
   - 見出し: `## YYYY-MM-DD セッションN: 一言要約`
   - やったこと / 決まったこと（ADRリンク）/ 次にやること（番号付き、roadmap ID付き）/ 注意点・気づき
3. **open-questions.md を更新**
   - 新しく出た未決事項を Q-xx で追加、回答が出たものは「解決済み」へ移し反映先をリンク
4. **決定があれば ADR を作成**（`docs/adr/NNNN-*.md`、テンプレートは `0000-template.md`）
5. CLAUDE.md の「現時点で未決」やコマンド類が古くなっていれば更新
6. 変更したファイルの一覧をユーザーに短く報告する（コミットはユーザーの指示があるときだけ）
