# contracts（契約・SSOT）向けルール

親の [CLAUDE.md](../CLAUDE.md) に加えて守ること。詳細は [README.md](README.md)。

- ここは API・ドメイン・Claude 入出力の**唯一の正**。バックエンドとアプリはこれに合わせる。実装の都合で合わせて書き換えない。
- 変更するときは **仕様（docs）→ 契約 → テスト** の順。変更前にユーザーへ確認する（hook が既存ファイルの編集で確認を出す）。
- 変更したら契約テストを必ず実行する（ルートの CLAUDE.md のコマンド）。`openapi.yaml` を変えたらアプリの `npm run gen:api` も実行する。
- `contracts/llm/<usecase>/` はスキーマ `$id` の版と `prompt.md` の `prompt_version` を一緒に上げる（LLM-07）。
- 採番済みの ID・エラーコードは再利用しない。
