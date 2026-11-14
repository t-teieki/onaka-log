# ADR-0017: ライブラリ・道具と、iOS 実機の扱い

- ステータス: Accepted
- 日付: 2026-11-14
- 関連: Q-40, Q-41, Q-42, Q-13, TEC-03・04・07〜14, TST-08, AUT-03, AUT-04, [比較資料](../02_design/discussions/library-selection.md)

## 背景

アプリとバックエンドの実装に入る前に、ライブラリ・テストの道具・ビルドの方法を決める。手元に Mac がなく、実機は iPhone だけ。2026-11 時点の Expo は SDK 58 で、App Store の Expo Go は SDK の新しい版に遅れて出ることがある。

## 決定

### 1. ライブラリ・道具（Q-40: 比較資料の推奨の一式）

| 領域 | 採用 |
|---|---|
| モバイル | Expo Router、TanStack Query、React の state / Context（状態管理ライブラリなし）、openapi-typescript ＋ openapi-fetch（OpenAPI を bundle してから型を生成）、expo-camera（撮影とバーコード）、expo-image-manipulator、expo-secure-store |
| サインイン（Q-42） | expo-auth-session で Cognito のサインイン画面（Hosted UI / マネージドログイン）を開く（PKCE）。Apple・Google は Cognito 側で連携する |
| バックエンド | FastAPI、AWS Lambda Web Adapter、boto3、anthropic、httpx、jsonschema、pyyaml、AWS Lambda Powertools（Logger）。**要求の検証は contracts のスキーマ（openapi.yaml・llm の input）を jsonschema で直接使い、Pydantic のモデルは書かない**（2026-11-14 変更、下の「変更履歴」） |
| テスト・品質 | pytest、FastAPI TestClient ＋ DynamoDB Local、Jest（jest-expo）＋ React Native Testing Library、Maestro（Android エミュレーターで E2E）、Ruff、mypy（`domain/` は strict）、TypeScript strict ＋ ESLint ＋ Prettier、`sam validate` ＋ cfn-lint |
| 使わない | 端末 DB（ADR-0015）、グラフ（MVP 外）、フォームライブラリ、DI コンテナ、共有パッケージ |

版の番号は ADR に書かず、実装の最初にその時点の安定版を入れてロックファイルで固定する。

### 2. iOS 実機の扱い（Q-41: Apple Developer Program の登録は最低優先）

ストア公開はまだ決めていないため、Apple Developer Program（年 $99）には当面登録しない。

- **日常の開発と確認は Android**: Windows の Android Studio のエミュレーターで、development build を使う（Android は登録なしでビルド・インストールできる）。E2E（Maestro）もここで動かす
- **iPhone は Expo Go で見た目を確かめる程度**: App Store の Expo Go が対応する SDK の版に合わせて、Expo の SDK を選ぶ（最新版より1つ古くなることがある）
- **Expo Go で確かめにくいもの**（Cognito のサインインの戻り先 URL、カメラの細かい挙動）は Android の development build で確かめる
- 登録するのは、ストア公開を決めたとき、または iPhone 実機でしか確かめられない問題が出たとき（Q-13 の「登録時期」はこれで決定）

## 変更履歴

- 2026-11-14: バックエンドの要求の検証を「Pydantic のモデルを手書き」から「contracts のスキーマを jsonschema で直接使う」に変えた。モデルを手で書くと契約と二重になり、ずれる余地が生まれるため。応答の形は API テストで openapi.yaml に照らして確かめる（TST-06）

## 理由と影響

- 比較資料のとおり、Expo の標準に寄せて道具を少なくし、1人で保守しやすくする
- iOS 実機での確認が遅れるため、iOS 固有の問題（Sign in with Apple の画面、カメラの権限の文言、キーボードなど）は登録後にまとめて確かめる。その分の手戻りは許容する
- Sign in with Apple は App Store の審査で必要になる（Google でのサインインを提供する場合）。Cognito での連携は Android と Web の範囲で先に作り、iOS での確認は登録後に行う
- 見直す条件: expo-auth-session で Apple・Google の連携がうまく動かない場合は Amplify の Auth を検討する。expo-camera のバーコード読み取りが遅い場合は react-native-vision-camera を検討する
