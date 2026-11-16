# onaka-log アプリ（Expo SDK 58 + TypeScript）

決定: [ADR-0005](../../docs/adr/0005-mobile-react-native-expo.md)・[ADR-0017](../../docs/adr/0017-libraries-and-tooling.md)。画面: [screens/README.md](../../docs/02_design/screens/README.md)。

## 構成

| 場所 | 中身 |
|---|---|
| `src/app/` | 画面のルーティング（Expo Router。1ファイル = 1画面）。中身は `src/features/` に置き、ここは薄くする |
| `src/features/<機能>/` | 機能ごとの画面・フック（`home/`、`record/`: 入力方式の選択シート・手入力・保存、`meal/`: 食事の詳細、`delete/`: 削除と「元に戻す」の待ち合わせとバー） |
| `src/api/` | API クライアント（openapi-fetch）。`schema.d.ts` は `contracts/api/openapi.yaml` から生成する（手で直さない） |
| `src/lib/` | 画面に依存しない計算（記録日 DM-01、表示の形） |
| `src/config.ts` | 接続先（`EXPO_PUBLIC_API_BASE_URL`） |
| `src/auth/` | サインイン（F-001）。`session.ts` がトークンの取得・保管・更新、`auth-gate.tsx` がサインイン画面との切り替え、`native.ts` が expo-auth-session・expo-secure-store とのつなぎ |
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
| ローカルのバックエンドを iPhone から | WSL の mirrored モードでは LAN から WSL の :8000 に届かないため、Windows の Node で中継する: `npm run api:relay`（0.0.0.0:8010 → 127.0.0.1:8000。起動時に接続先の候補を表示）。`.env.local` に `EXPO_PUBLIC_API_BASE_URL=http://<PC の LAN の IP>:8010` を書き、`npx expo start -c` で開発サーバーを起動し直す。エミュレーターも同じ接続先で届く。PC の IP が変わったら書き直す |
| dev（AWS） | `.env.local` に `EXPO_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.ap-northeast-1.amazonaws.com`（`/v1` は付けない）と、サインインのための `EXPO_PUBLIC_COGNITO_DOMAIN`・`EXPO_PUBLIC_COGNITO_CLIENT_ID`（スタックの出力 `CognitoDomain`・`AppClientId`）。準備は [infra/README.md](../../infra/README.md) の「Google でサインインの準備」 |

- `EXPO_PUBLIC_COGNITO_*` がなければサインインを使わず、トークンなしで API を呼ぶ（ローカルのバックエンド用、F-001-04）。ローカルに戻すときは2行を消して `npx expo start -c`

## 実機・エミュレーター

- Android エミュレーター: Android Studio の Device Manager で Pixel 8・API 35/36（Google Play 付き）を作る。Expo Go を入れ、開発サーバーの `a` キーか QR で開く
  - **Android 17（API 37）では**、Expo Go に「ローカルネットワークへのアクセス」（`ACCESS_LOCAL_NETWORK`）の許可がないと `10.0.2.2` への通信が止まり、ホームが読み込み中・「読み込めませんでした」のままになる（2026-11-15）。設定アプリで Expo Go に許可を与えるか、API 35/36 のエミュレーターを使う
  - バックエンドに届くかは adb のシェルから確かめられる（シェルは許可の制限を受けない）。送信側をすぐ閉じると uvicorn が応答せずに切るので、`adb shell "(printf 'GET /v1/days/2026-11-15 HTTP/1.0\r\n\r\n'; sleep 2) | toybox nc -w 5 10.0.2.2 8000"` のように少し待つ
- iPhone 13 mini: App Store の Expo Go（SDK 58 対応）で、開発サーバーの QR をカメラで読む。同じ Wi-Fi で、Windows のファイアウォールが 8081 を通すこと。つながらなければ `npx expo start --tunnel`
