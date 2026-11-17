// PreToolUse hook（HNS-04）: 既存のテスト・契約ファイルの編集は、ユーザーに確認させる。
// 実装フェーズでは「テストと契約を変更しない」（CLAUDE.md）。新規ファイルの作成は止めない（テスト先行で足すため）。
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
let input;
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const abs = resolve(root, filePath);
const rel = relative(root, abs).replaceAll("\\", "/");

// node_modules や生成物は対象外
if (rel.startsWith("..") || rel.includes("node_modules/")) process.exit(0);

const guarded = [
  /^contracts\//,
  /^tests\//,
  /^apps\/api\/tests\//,
  /^apps\/mobile\/__tests__\//,
  /^apps\/mobile\/src\/.*\.test\.tsx?$/,
];
if (!guarded.some((re) => re.test(rel))) process.exit(0);
if (!existsSync(abs)) process.exit(0); // 新規作成は許可

const out = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason:
      `${rel} は既存のテスト／契約です。実装フェーズでは変更しません。` +
      "変更が必要なら、仕様 → 契約 → テストの順に直す前提でユーザーが了承してください（TST-11）。",
  },
};
process.stdout.write(JSON.stringify(out));
