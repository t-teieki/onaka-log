# poc（検証用）向けルール

親の [CLAUDE.md](../CLAUDE.md) に加えて守ること。M2 の PoC は完了済み（[poc-summary.md](reports/poc-summary.md)）。

- 本番コードではない。プロダクトのコードから import しない。LLM 回帰評価（TST-07）でサンプルとスクリプトを流用するときだけ動かす。
- `poc/samples/` の画像は Git に入れない（`.gitignore` 済み。CSV は管理）。画像の中身をログ・レポートに貼らない。
- 実 API を呼ぶスクリプトは費用がかかる。動かす前にユーザーの了承を得る。結果は `poc/reports/` にまとめる（`poc/results/` は Git 管理外）。
