@AGENTS.md

# onaka-log 固有のルール

親の [CLAUDE.md](../../CLAUDE.md) に加えて守ること。詳細は [README.md](README.md)。

- 実行は **Windows の Node で**（PowerShell、`apps/mobile` から）。`npm test`・`npm run typecheck`・`npm run lint` が通ってから完了とする。
- 先にテスト: `__tests__/` に spec ID 付きで書き、赤を確認してから実装する。**既存のテストと `contracts/` は実装中に変えない**（hook が確認を出す）。
- API の型は `npm run gen:api` で `contracts/api/openapi.yaml` から生成する。`src/api/schema.d.ts` は手で直さない。openapi.yaml を変えたら再生成して差分を含める（CI が差分を検査する）。
- 画面・文言の仕様は [screens/README.md](../../docs/02_design/screens/README.md)。エラー文言は API の `code` からアプリが決める。
- 撮影した画像は一時ファイルをすぐ消し、保存・ログ出力をしない（ADR-0004）。
- 依存の追加は `npx expo install`。Expo は破壊的変更が多いので、API は AGENTS.md のとおり公式ドキュメントで確かめる。
