---
name: adr
description: 重要な決定を ADR（docs/adr/NNNN-*.md）として起票する。
---

# ADR の起票

引数: 決定の題（例: `Prettier を導入する`）。

1. `docs/adr/` の最大の番号を調べ、次の番号を振る（採番済みの ID は再利用しない）。ファイル名は英語（ASCII）のケバブケース: `NNNN-<slug>.md`。
2. `docs/adr/0000-template.md` をもとに、本文は日本語で書く。前提・選択肢（比較）・決定・影響を書く。**決定はユーザーが下したものだけを書き、未決は推測で埋めず `docs/00_project/open-questions.md` に Q-xx で積む。**
3. 関連する ADR・roadmap の ID・仕様へリンクする。`docs/README.md` に ADR の索引があれば追記する。
4. roadmap の該当項目に成果物としてリンクする。
