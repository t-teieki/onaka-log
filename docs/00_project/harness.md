# Claude Code ハーネス（HNS）の整備状況とタスク

> ステータス: Draft / 最終更新: 2026-11-17
> 関連: roadmap の HNS-01〜11、[strategy.md](../03_testing/strategy.md) §5、[ADR-0001](../adr/0001-spec-driven-and-test-driven.md)

## 1. 今あるもの

| 部品 | 場所 | 役割 |
|---|---|---|
| ルールの本体 | [/CLAUDE.md](../../CLAUDE.md) | セッション開始・終了の手順、開発プロセス、コマンド |
| 領域ごとのルール（HNS-06） | `apps/api/CLAUDE.md`・`apps/mobile/CLAUDE.md`（`AGENTS.md` を取り込む）・`contracts/CLAUDE.md`・`poc/CLAUDE.md` | その領域のファイルを触るときだけ読み込まれる |
| 権限（HNS-05） | `.claude/settings.json` の `permissions` | テスト・lint・trace・読み取りの git は確認なし。`.env` の読み取りと force push・`reset --hard` は拒否 |
| テスト改変のガード（HNS-04） | `.claude/hooks/guard-spec-files.mjs`（PreToolUse） | 既存の `contracts/`・テストを Edit/Write するとユーザーに確認を出す。新規ファイルは止めない |
| テスト先行の skill（HNS-07） | `.claude/skills/spec-to-test`・`implement`・`adr` | 赤まで書く → 緑まで実装 → ADR 起票 |
| サブエージェント（HNS-08） | `.claude/agents/contract-consistency-checker.md` | 契約と実装・型・テストのずれを読み取り専用で確認 |
| 引継ぎ skill | `.claude/skills/handoff/` | roadmap・progress-log・open-questions の更新 |
| トレーサビリティ（HNS-11） | `tools/trace.py --check`（CI の `contract`） | 仕様 ID とテストの対応の抜けを検出 |
| MCP | `.mcp.json`（drawio） | 構成図の作成 |

## 2. 方針（HNS-03）

「テストが仕様」。実装フェーズではテストと契約を変えない。変更が必要になったら手を止め、仕様 → 契約 → テストの順に直す。手順は [strategy.md §5](../03_testing/strategy.md)。機械的な担保は hook（確認を出す。ブロックはしない）。テストを足す段階では既存ファイルへの追記も確認が出るが、そこは了承して進める。

## 3. 残りのタスクと決定

| ID | 状態 | 内容 |
|---|---|---|
| HNS-05 後半 | 未 | 保存時の整形・lint の PostToolUse hook。ADR-0017 で Prettier は採用済みだが設定が無い。導入（devDependency・設定）とあわせて行う |
| HNS-07 | 完了 | `/spec-to-test`・`/implement`・`/adr`（`.claude/skills/`）。`/spec` は仕様の書き方が固まってから |
| HNS-08 | 完了 | 契約整合性チェック役（`.claude/agents/contract-consistency-checker.md`、読み取り専用） |
| HNS-09 | SKIP | GitHub は `gh` で足りる、drawio は導入済み。AWS・DynamoDB の MCP は入れない |
| HNS-10 | SKIP | API キーを GitHub に置かない。手元の `/code-review` で代用（CIC-10 も同様） |

## 4. 既知の注意

- `permissions.allow` の WSL コマンドは接頭辞の一致。引用符の中に `&&` で別の命令をつなぐ書き方は防げないので、了承を求める画面の中身は見る。
- `.claude/settings.json` に入っていた `mcpServers` は設定の項目ではなかった（`.mcp.json` が本体で重複）ため削除した。
