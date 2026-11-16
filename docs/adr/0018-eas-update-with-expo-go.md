# ADR-0018: 外から使うための配布は EAS Update を Expo Go で開く（当面）

- ステータス: Accepted
- 日付: 2026-11-16
- 関連: CIC-06, ADR-0003, ADR-0005, ADR-0006, Q-45

## 背景

iPhone の Expo Go は、PC の開発サーバー（Metro、LAN の IP）から JavaScript を読み込んで動いていた。家の外では PC に届かず、サインインの戻り先も LAN の IP（`exp://192.168.3.2:8081/...`）なので、外では使えなかった。直近は自分専用（ADR-0003）で、Apple Developer Program は最低優先（年 99 ドル）。

## 選択肢

| 選択肢 | 長所 | 短所 |
|---|---|---|
| A. EAS Update を Expo Go で開く | Apple Developer Program なしで、PC を点けておかずに外から使える。無料枠で足りる | Expo Go で動くライブラリだけに限られる。Expo のアカウントとサーバーに頼る |
| B. `npx expo start --tunnel` | 設定がほぼ要らない | PC と Metro を起動したままにする必要がある。URL が起動ごとに変わりうる |
| C. 開発ビルド・TestFlight | 本物のアプリとして入る。Sign in with Apple も試せる | Apple Developer Program が要る |

## 決定

A。Expo のプロジェクト `@t-teieki/onaka-log` に、チャンネル `main`（ブランチ `main`）で公開し、iPhone の Expo Go で `exp://u.expo.dev/<projectId>?channel-name=main` を開く。

- `app.json` の `runtimeVersion` は `{"policy": "sdkVersion"}`（Expo Go が読める版 `exposdk:58.0.0`）、`updates.url` は `https://u.expo.dev/<projectId>`
- 公開: `apps/mobile` で `npx eas-cli@27.10.0 update --branch main --message "<内容>" --platform ios --environment development --non-interactive`
- 接続先（`EXPO_PUBLIC_*`、どれも秘密ではない）は EAS の環境変数 development に置く（`.env.local` を `eas env:push development --path .env.local --force` で送る）。公開時は手元の `.env.local` ではなくこちらが使われる
- サインインの戻り先は `exp://u.expo.dev/<projectId>/--/auth/callback`（とクエリ付きの候補）を Cognito の dev に登録した（`infra/samconfig.toml`）

## 理由と影響

- 自分専用の間は、費用と手間がいちばん小さい A で足りる。ストア公開（ADR-0003）や Sign in with Apple（ADR-0006）を進めるときに C（EAS Build・TestFlight）へ移る
- `EXPO_PUBLIC_*` は `process.env.EXPO_PUBLIC_X` とそのまま書いた所だけが公開時に値へ置き換わる。引数経由で読むと公開版では undefined になる（実際に Cognito の設定が抜けてトークンなしで API を呼んでいた。2026-11-16 に修正し、テストで書き方を固定）
- `eas update` が `expo-updates` を依存に足した（Expo Go では使われず、開発ビルドに移るときに使う）
- 公開した版はアプリの「別の体験」として扱われ、サインインは家の開発サーバーの版とは別に必要
- 見直す条件: Expo Go で動かないライブラリが必要になったとき、ストア公開・TestFlight に進むとき、Expo Go が SDK 58 に対応しなくなったとき
