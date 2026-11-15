# onaka-log アプリ（Expo SDK 58 + TypeScript）

決定: [ADR-0005](../../docs/adr/0005-mobile-react-native-expo.md)・[ADR-0017](../../docs/adr/0017-libraries-and-tooling.md)。画面: [screens/README.md](../../docs/02_design/screens/README.md)。

## 構成

| 場所 | 中身 |
|---|---|
| `src/app/` | 画面のルーティング（Expo Router。1ファイル = 1画面）。中身は `src/features/` に置き、ここは薄くする |
| `src/features/<機能>/` | 機能ごとの画面・フック（今は `home/`） |
| `src/api/` | API クライアント（openapi-fetch）。`schema.d.ts` は `contracts/api/openapi.yaml` から生成する（手で直さない） |
| `src/lib/` | 画面に依存しない計算（記録日 DM-01、表示の形） |
| `src/config.ts` | 接続先（`EXPO_PUBLIC_API_BASE_URL`） |
| `__tests__/` | 単体テスト（Jest＋React Native Testing Library）。ファイル名は `*-test.ts(x)` |

## コマンド（**Windows の Node で** `apps/mobile` から。PowerShell）

WSL から `/mnt/c` に `npm install` すると極端に遅いため、アプリの npm と Expo は Windows の Node（22.13 以上）で動かす（[dev-environment.md](../../docs/00_project/dev-environment.md)）。

```powershell
npm install
npm test            # 単体テスト
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint＋Prettier（npx expo lint --fix で直す）
npm run gen:api     # contracts/api/openapi.yaml を変えたら型を作り直す（CI で差分がないことを確かめる）
npx expo start      # 開発サーバー
```

- 依存は `npx expo install <名前>` で入れる（SDK に合う版を選ぶ）。開発用は `npx expo install <名前> "--" --dev`
- `openapi-typescript` は TypeScript 6 と peer がぶつかるため入れず、`gen:api` で版を固定して `npx` で動かす

## 接続先

| つなぐ先 | 設定 |
|---|---|
| ローカルのバックエンド（既定） | WSL で `ONAKA_REPOSITORY=memory ONAKA_LOCAL_USER_ID=local-dev uvicorn onaka_api.main:app --host 0.0.0.0 --port 8000`（[apps/api/README.md](../api/README.md)）。エミュレーターからは `http://10.0.2.2:8000`（既定値） |
| dev（AWS） | `.env.local` に `EXPO_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.ap-northeast-1.amazonaws.com`（`/v1` は付けない）。サインイン（F-001）を作るまではトークンがないため 401 になる |

## 実機・エミュレーター

- Android エミュレーター: Android Studio の Device Manager で Pixel 8・API 35/36（Google Play 付き）を作る。Expo Go を入れ、開発サーバーの `a` キーか QR で開く
- iPhone 13 mini: App Store の Expo Go（SDK 58 対応）で、開発サーバーの QR をカメラで読む。同じ Wi-Fi で、Windows のファイアウォールが 8081 を通すこと。つながらなければ `npx expo start --tunnel`
