# ライブラリ・道具の選定（TEC-03・07〜10・12・14、TST-08、AUT-04）

> ステータス: 比較資料。2026-11-14 に推奨の一式で決定（[ADR-0017](../../adr/0017-libraries-and-tooling.md)）。ただし iOS は Apple Developer Program に当面登録せず、Android エミュレーター中心で開発する（Q-41）
> 最終更新: 2026-11-14
> 関連: ADR-0005, ADR-0007, ADR-0014, ADR-0016, [strategy.md](../../03_testing/strategy.md), [screens](../screens/README.md)

版の番号は書かない。実装の最初に、その時点の安定版を入れて固定する（2026-11 時点の Expo は SDK 58）。

## 1. モバイル（Expo + TypeScript）

| 用途 | 推奨 | 他の候補 | 理由 |
|---|---|---|---|
| ルーティング（TEC-03） | **Expo Router**（ファイルで画面を決める） | React Navigation を直接 | Expo の標準。画面一覧（screens/README.md）をそのままファイルにできる。中身は React Navigation |
| サーバーのデータ（TEC-03） | **TanStack Query** | SWR、自前 | 1日分の取得・保存後の再取得・再送・読み込み中の状態をまとめて扱える。削除の「元に戻す」（遅らせて送る）も楽観的更新で書ける |
| 画面の状態（TEC-03） | **React の state と Context だけ** | Zustand、Redux | 画面をまたぐ状態は「確認画面に渡す候補」「サインイン状態」程度。足りなくなったら Zustand |
| DI（TEC-03） | 使わない（API クライアントを Context で渡す） | — | テストではクライアントを差し替えるだけで足りる |
| API の型・クライアント（TEC-07） | **openapi-typescript**（型を生成）＋ **openapi-fetch**（型付きの小さなクライアント） | Orval、openapi-generator | OpenAPI 3.1 に対応し、生成物が型だけで軽い。domain への `$ref` は生成の前に OpenAPI を1ファイルにまとめる（bundle）手順を入れる |
| 入力の検証 | 手入力の5項目だけなので、ライブラリなし | Zod、React Hook Form | フォームが小さい |
| カメラ・バーコード（TEC-10） | **expo-camera**（`CameraView` の撮影とバーコード読み取り。EAN-13・EAN-8） | react-native-vision-camera | Expo の標準で、撮影とバーコードを1つで扱える。読み取り速度が足りなければ vision-camera を検討 |
| 画像の縮小（TEC-10） | **expo-image-manipulator**（長辺 1024px・JPEG） | — | Expo の標準。メモリ上で縮小し、ファイルに残さない |
| トークンの保存（AUT-04） | **expo-secure-store**（iOS は Keychain、Android は Keystore） | AsyncStorage（不可） | 安全な保存が要る |
| サインイン（AUT-03） | **expo-auth-session** で Cognito のサインイン画面（Hosted UI / マネージドログイン）をブラウザで開く（PKCE）。Apple・Google は Cognito 側で連携 | AWS Amplify の Auth | 軽く、Cognito だけで完結する。ただし Apple・Google のブラウザ経由の連携は実機での確認が要る（実装の最初に小さく試す） |
| グラフ（TEC-11） | MVP では使わない（推移グラフは次期） | — | — |
| 端末 DB（TEC-04） | 使わない（サーバーファースト、ADR-0015） | — | — |

## 2. バックエンド（Python / FastAPI）

| 用途 | 推奨 | 理由 |
|---|---|---|
| Web フレームワーク | **FastAPI**＋**Pydantic v2**（入出力のモデルは手で書き、API テストで契約との一致を確かめる） | ADR-0007。モデルを生成すると道具が増えるため、契約テスト（TST-06）で守る |
| Lambda で動かす | **AWS Lambda Web Adapter**（レイヤー）、ローカルは **uvicorn** | 同じコードをローカルと Lambda で動かせる（ADR-0007） |
| DynamoDB | **boto3** | AWS 公式。テーブルは1つで操作も少ない |
| Claude | **anthropic**（公式 SDK） | PoC で使ったもの |
| Open Food Facts | **httpx** | PoC で使ったもの。タイムアウトを指定しやすい |
| 出力の検証 | **jsonschema**（contracts の完全版スキーマで検証） | 契約テストと同じ仕組み |
| ログ | **AWS Lambda Powertools**（Logger） | 構造化ログ。画像・入力本文を出さない設定にしやすい |

## 3. テスト・品質の道具（TEC-08・09、TST-08）

| 用途 | 推奨 | 理由 |
|---|---|---|
| Python のテスト | **pytest**（今の契約テストと同じ） | — |
| API テスト | FastAPI の **TestClient** ＋ **DynamoDB Local**（Docker） | 方針どおり（strategy.md ③） |
| モバイルの単体・部品 | **Jest**（`jest-expo` の設定）＋ **React Native Testing Library** | Expo の標準の組み合わせ |
| E2E（TST-08） | **Maestro**（Android エミュレーターで） | YAML で書け、Windows から Android で動かせる。iOS の E2E は Mac がないため対象外 |
| Python の lint・整形 | **Ruff**（lint と format） | 1つで済み速い |
| Python の型 | **mypy**（`domain/` は strict） | — |
| TypeScript | **TypeScript の strict**、**ESLint**（Expo の設定）、**Prettier** | Expo の標準 |
| インフラ | `sam validate`、**cfn-lint** | 方針どおり（strategy.md ⑤） |

## 4. ビルドと実機確認（TEC-12・14）

| 項目 | 推奨 | 注意 |
|---|---|---|
| Android | **Windows の Android Studio のエミュレーター**で日常の確認と E2E | 実機は将来 |
| iOS の開発中の確認 | **EAS Build の development build** を iPhone に入れる | **Apple Developer Program（年 $99）への登録が要る**（Q-13、月1000円とは別枠）。Expo Go は App Store 版が SDK の新しい版に遅れて出ることがあるため、Expo Go だけに頼らない |
| iOS の配布（自分用） | **EAS Build ＋ EAS Submit で TestFlight** | 同じく登録が要る |
| EAS の料金 | 無料枠で始める（ビルドの回数に上限があり、待ち時間が長いことがある） | 足りなければ見直す |

**登録しない場合**: Android エミュレーターで開発を進め、iPhone では Expo Go（対応する版が App Store に出ていれば）で確認する。カメラ・Cognito の連携など実機で確かめたい部分は、登録してから確認する。
