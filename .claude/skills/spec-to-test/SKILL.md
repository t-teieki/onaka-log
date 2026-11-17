---
name: spec-to-test
description: 機能仕様の要件 ID（F-xxx-yy や DM-xx）からテストを書き、赤（失敗）を確認する。テスト先行の「テスト」の段階で使う。
---

# 仕様 → テスト（赤まで）

引数: 対象の要件 ID（例: `F-030-08..12`）。省略時は、テストが無い MVP の要件をユーザーに確認して選ぶ。

1. 対象の仕様を読む: `docs/01_requirements/features/F-xxx-*.md`（DM は `docs/02_design/domain-model.md` §6）。関係する `contracts/` と `docs/03_testing/strategy.md` §3 も読む。曖昧な点は推測で埋めず、`docs/00_project/open-questions.md` に積んでユーザーに確認する。
2. 層を決める（strategy.md §2）: ルール・計算 → `apps/api/tests/unit/`、API → `apps/api/tests/api/`（応答は openapi.yaml で検証）、アプリ → `apps/mobile/__tests__/`。
3. テストを書く。Python は `@pytest.mark.spec("F-xxx-yy")`、アプリはテスト名の先頭に `[F-xxx-yy]`（規約は `docs/03_testing/traceability.md` §1）。1要件につき正常系と主なエラーを書く。画像は小さなダミー、Claude は記録した応答に差し替える（Git に実画像を入れない）。
4. **赤を確認する**: 書いたテストだけを実行し、実装が無いことによる失敗であること（構文エラーやインポート漏れではないこと）を確かめる。コマンドは CLAUDE.md の「コマンド」を使う。
5. `tools/trace.py --check` を実行する。
6. 実装は始めない。結果（テスト名・赤の理由）を報告し、コミットの提案は「テスト: F-xxx-yy を追加（赤）」の形で出す。コミットはユーザーが頼んだときだけ。

既存のテスト・契約を変える必要が出たら手を止めてユーザーに確認する（既存ファイルへの編集は hook が確認を出す）。
