# 未決事項（ユーザー判断待ち）

> 推測で埋めずにここに積む。回答が出たら「回答」欄を埋め、反映先（ADR・仕様）をリンクして「解決済み」へ移す。
> 優先度: 🔴 他の多くの判断をブロック / 🟡 当該フェーズまでに必要 / 🟢 後回し可

## 未解決

| ID | 優先 | 質問 | 関連 | 補足・選択肢（推奨は★） |
|---|---|---|---|---|
| — | — | （現在、ユーザー判断待ちの事項はなし） | — | — |

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
| Q-12 | バックエンド構成 | C案: AWS サーバーレス（API Gateway + Lambda(FastAPI) + Cognito）。DB は Q-21 | [ADR-0007](../adr/0007-backend-aws-serverless.md) |
| Q-11 | モバイルの技術スタック | React Native（Expo）+ TypeScript | [ADR-0005](../adr/0005-mobile-react-native-expo.md) |
| Q-13 | ストア登録費の扱い | 月1000円とは別枠。登録時期は今は検討しない | roadmap TEC-13 |
| Q-14 | 分量の自動決定ルール | 既定は「全部食べた」。オプションでワンタップ選択（1/4・1/2 など）で直せる | [scope.md](../01_requirements/scope.md) |
| Q-15 | 読み取れない場合 | エラーダイアログを表示し、ホームの読み取り方式選択画面に戻る | [scope.md](../01_requirements/scope.md) |
| Q-16 | MVP の閲覧・編集範囲 | 日次合計＋食事一覧（4時区切り）、推定結果の確認・修正画面、食品/食事の削除。推移グラフ・目標値は MVP 外 | [scope.md](../01_requirements/scope.md) |
| Q-17 | 認証の導入時期 | 最初から入れる。Sign in with Apple + Google | [ADR-0006](../adr/0006-auth-from-day-one.md) |
| Q-18 | 開発環境 | リポジトリは C ドライブ上に置き、開発は WSL から行う | [dev-environment.md](dev-environment.md) |
| Q-19 | テキスト入力 | MVP に含める（2026-11-13 訂正: Claude による推定ではなく、利用者が食品名と数値を手入力する方式。Q-30） | [scope.md](../01_requirements/scope.md)、[ADR-0012](../adr/0012-manual-text-input.md) |
| Q-20 | リポジトリの置き場所 | C ドライブのまま。性能などが問題になりそうなら WSL 側へ移す | [dev-environment.md](dev-environment.md) |
| Q-21 | DB | DynamoDB | [ADR-0008](../adr/0008-database-dynamodb.md) |
| Q-22 | PoC-1 の判定（2026-11-13） | 条件付きで採用（出どころの表示と OCR へのワンタップ切り替え） | [ADR-0009](../adr/0009-barcode-adoption-and-net-content.md) |
| Q-23 | 内容量が取れないとき（2026-11-13） | 内容量が不明なまま登録してよい。基準（100g 当たり／1食当たりの推定）と「内容量：不明」を必ず一緒に保存し、確認画面に出す。100g 当たりの値のまま日次合計に含める | [ADR-0009](../adr/0009-barcode-adoption-and-net-content.md) |
| Q-24 | OCR のモデルと画像サイズ（2026-11-13） | Haiku 5.5・effort low。画像は長辺 1024〜1568px に縮小 | [ADR-0010](../adr/0010-label-ocr-model-and-image-size.md) |
| Q-25 | OCR で読めないとき（2026-11-13） | エラーダイアログに「撮り直す」ボタンと撮り方の案内（正面から・近づけて）を加える。「入力方法の選択に戻る」も残す | [scope.md](../01_requirements/scope.md) |
| Q-26 | 栄養成分表示に複数列があるとき（2026-11-13） | Claude に全列を返させ、確認画面で利用者が列を選ぶ（出力スキーマ v0.3） | [scope.md](../01_requirements/scope.md)、LLM-03 |
| Q-27 | 「1個当たり」・複数個入りの分量の既定（2026-11-13） | 既定は「1個」。ワンタップで個数（1・2・…・全部）を選ぶ | [scope.md](../01_requirements/scope.md) |
| Q-28 | 写真推定の正解データ（2026-11-13） | 用意しない。本番でも正解はなく、推定値をそのまま登録する前提。PoC-3 も正解なしで評価する | [scope.md](../01_requirements/scope.md)、[poc/README.md](../../poc/README.md) |
| Q-29 | 写真推定のモデル（2026-11-13） | Sonnet 5.5・effort medium | [ADR-0011](../adr/0011-food-photo-model.md) |
| Q-30 | PoC-4（テキスト推定）の進め方（2026-11-13） | テキスト推定はしない。④は利用者が食品名と数値を手入力する方式で、他の方式で推定できない・不正確なときに使う。text-estimate の契約は削除し、PoC-4 は SKIP | [ADR-0012](../adr/0012-manual-text-input.md) |
| Q-31 | 保存後の修正（2026-11-14） | MVP では保存した食品の値を直さない（間違えたら削除して記録し直す）。食品が0件になった食事は自動で削除する | [scope.md](../01_requirements/scope.md)、[data-access-patterns.md](../02_design/data-access-patterns.md) |
| Q-32 | 食事のまとまり方と区分（2026-11-14） | 1回の記録で1食事を作り、後から同じ食事に食品を足せる。食事区分（朝・昼・夕・間食）は MVP では持たず、時刻で並べる | [scope.md](../01_requirements/scope.md)、[data-access-patterns.md](../02_design/data-access-patterns.md) |
| Q-33 | 食べた日時（2026-11-14） | 既定は記録した時刻。確認画面で日時を変えられる（過去の日時も可）。保存後は変えない。タイムゾーンは日本時間に固定（MVP） | [scope.md](../01_requirements/scope.md)、[data-access-patterns.md](../02_design/data-access-patterns.md) |
