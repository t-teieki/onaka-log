# ADR-0005: モバイルは React Native（Expo）+ TypeScript

- ステータス: Accepted
- 日付: 2026-11-11
- 関連: Q-11, TEC-01, TEC-12

## 背景

iOS・Android の両方に対応する。手元に Mac がなく、実機は iPhone のみ。React と Python の経験はあるが、Flutter・React Native は未経験。

## 選択肢

| 選択肢 | 長所 | 短所 |
|---|---|---|
| React Native（Expo）+ TS | React の知識が活きる。EAS Build（クラウドビルド）で Mac なしでも iOS ビルドできる。開発中は iPhone の Expo Go で確認できる | ネイティブ機能によっては development build が必要 |
| Flutter | 描画性能・UI の一貫性が高い | Dart を新たに学ぶ必要がある。Mac なしの iOS ビルドは Codemagic などの外部サービスが必要 |
| ネイティブ（Swift / Kotlin） | 各 OS の機能をすべて使える | 2つのコードベースが必要。iOS 開発には Mac が必須 |

## 決定

React Native（Expo）+ TypeScript を採用する。

## 影響

- 契約（JSON Schema）から TypeScript の型を生成し、アプリで使う（TEC-07）。
- カメラ・バーコード読み取りは Expo のライブラリを第一候補にする（TEC-10）。
- 独自のネイティブモジュールが必要になった場合は development build（EAS Build）を使う。iPhone 実機にインストールするには Apple Developer Program への登録が必要になる場面がある（費用は別枠: Q-13）。
- Android は Windows 上のエミュレータで検証する（TEC-14）。
