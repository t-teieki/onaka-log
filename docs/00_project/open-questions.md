# 未決事項（ユーザー判断待ち）

> 推測で埋めずにここに積む。回答が出たら「回答」欄を埋め、反映先（ADR・仕様）をリンクして「解決済み」へ移す。
> 優先度: 🔴 他の多くの判断をブロック / 🟡 当該フェーズまでに必要 / 🟢 後回し可

## 未解決

| ID | 優先 | 質問 | 関連 | 補足・選択肢（推奨は★） |
|---|---|---|---|---|
| Q-12 | 🔴 | バックエンドの構成は？ Supabase（Auth・Postgres・Edge Functions）か、AWS 上に Python(FastAPI)・DB などを置く構成か | ARC-03, TEC-05, TEC-06, INF-01, AUT-03 | 比較資料: [バックエンド構成比較](../../議論/バックエンド構成/バックエンド構成比較.md)。★MVP は Supabase。AWS を使うなら、コンテナの常時起動（月4,500円〜）ではなくサーバーレス（Lambda） |
| Q-20 | 🟢 | WSL から C ドライブ上のリポジトリで開発するとき、性能や接続の問題が出たらどう対処するか | PRJ-10 | 想定される問題と対処は [dev-environment.md](dev-environment.md)。★まず WSL のミラーモードネットワーク＋ Expo の `--tunnel` で始め、`npm install` やファイル監視が遅ければ見直す |

## 解決済み

| ID | 質問 | 回答（2026-11-11） | 反映先 |
|---|---|---|---|
| — | 開発プロセス | 仕様駆動＋テスト駆動。Claude API 入出力はスキーマ定義＋検証テスト必須 | [ADR-0001](../adr/0001-spec-driven-and-test-driven.md) |
| Q-01 | 利用者範囲 | 将来はストアで一般公開を視野に入れる。直近は自分専用 | [ADR-0003](../adr/0003-phased-release-design.md) |
| Q-02 | リポジトリ独立化 | 独立させる → 対応済み（GitHub: `t-teieki/onaka-log`） | roadmap PRJ-01, PRJ-02 |
| Q-03 | MVP の入力方式 | バーコード・OCR・写真推定（Q-19 でテキスト入力も追加） | [scope.md](../01_requirements/scope.md) |
| Q-04 | 対象 OS | iOS・Android 両方。手元の実機は iOS のみ。開発 PC は Windows と WSL+Ubuntu | [non-functional.md](../01_requirements/non-functional.md), roadmap TEC-12〜14 |
| Q-05 | 技術経験 | Flutter・React Native は未経験。React・Python は経験あり | Q-11, Q-12 |
| Q-06 | 運用コスト | 月1000円程度まで。利用者は多くない想定 | [non-functional.md](../01_requirements/non-functional.md) NFR-001 |
| Q-07 | 画像の保存 | 保存しない。データ取得後すぐ破棄 | [ADR-0004](../adr/0004-no-image-retention.md) |
| Q-08 | 分量入力 | 人が入力せず読み取りで決める。UX 重視で入力の手間を極力なくす。MVP に含める | [scope.md](../01_requirements/scope.md), Q-14, Q-15 |
| Q-09 | 1日の境界 | 4時 | [scope.md](../01_requirements/scope.md) |
| Q-10 | PoC サンプル | ユーザーが用意する | roadmap POC-03 |
| Q-11 | モバイルの技術スタック | React Native（Expo）+ TypeScript | [ADR-0005](../adr/0005-mobile-react-native-expo.md) |
| Q-13 | ストア登録費の扱い | 月1000円とは別枠。登録時期は今は検討しない | roadmap TEC-13 |
| Q-14 | 分量の自動決定ルール | 既定は「全部食べた」。オプションでワンタップ選択（1/4・1/2 など）で直せる | [scope.md](../01_requirements/scope.md) |
| Q-15 | 読み取れない場合 | エラーダイアログを表示し、ホームの読み取り方式選択画面に戻る | [scope.md](../01_requirements/scope.md) |
| Q-16 | MVP の閲覧・編集範囲 | 日次合計＋食事一覧（4時区切り）、推定結果の確認・修正画面、食品/食事の削除。推移グラフ・目標値は MVP 外 | [scope.md](../01_requirements/scope.md) |
| Q-17 | 認証の導入時期 | 最初から入れる。Sign in with Apple + Google | [ADR-0006](../adr/0006-auth-from-day-one.md) |
| Q-18 | 開発環境 | リポジトリは C ドライブ上に置き、開発は WSL から行う | [dev-environment.md](dev-environment.md) |
| Q-19 | テキスト入力 | MVP に含める | [scope.md](../01_requirements/scope.md) |
