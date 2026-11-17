---
name: implement
description: 指定した要件 ID のテストが緑になるまで実装する。テストと契約は変えない。テスト先行の「実装」の段階で使う。
---

# 実装（緑まで）

引数: 対象の要件 ID またはテストのパス（例: `F-030-08..12`、`apps/api/tests/api/test_meals_api.py`）。

1. 対象のテストを実行して赤を確認する。赤でない（既に緑）なら、何も実装せず報告する。テストが無いなら実装せず `/spec-to-test` を提案する。
2. 仕様と契約を読み、実装する。**テストと `contracts/` は変えない。** 変える必要があると判断したら手を止め、理由をユーザーに示して確認する（仕様 → 契約 → テストの順に直す）。
3. 対象のテストが緑になるまで繰り返す。テストを通すためだけの分岐・特例（テストの値の直書きなど）は入れない。
4. 仕上げに領域ごとのチェックを全部通す:
   - API: pytest（`apps/api/tests`）・Ruff・mypy（`apps/api/CLAUDE.md`）
   - アプリ: `npm test`・`npm run typecheck`・`npm run lint`（`apps/mobile/CLAUDE.md`）
   - `contracts/` に触れたなら契約テスト
   - 最後に `tools/trace.py --check`
5. 結果を報告する（緑になったテスト、実行したチェック、実行できなかったもの）。コミットは頼まれたときだけ。仕様の状態が変わったなら roadmap の更新は `/handoff` で行う。
