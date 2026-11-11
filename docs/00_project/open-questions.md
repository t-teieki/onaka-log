# 未決事項（ユーザー判断待ち）

> 推測で埋めずにここに積む。回答が出たら「回答」欄を埋め、反映先（ADR・仕様）をリンクして「解決済み」へ移す。
> 優先度: 🔴 他の多くの判断をブロック / 🟡 当該フェーズまでに必要 / 🟢 後回し可

## 未解決

| ID | 優先 | 質問 | 関連 | 補足・選択肢（推奨は★） |
|---|---|---|---|---|
| Q-11 | 🔴 | モバイルの技術スタックは？ | TEC-01, TEC-12 | ★**React Native（Expo）+ TypeScript**: React 経験が活きる／Mac なしでも EAS Build（クラウドビルド）で iOS ビルド可／開発中は iPhone の Expo Go で確認可。Flutter: Dart の学習が必要、Mac なしの iOS ビルドは Codemagic 等が必要 |
| Q-12 | 🔴 | バックエンドの形態と言語は？ | ARC-03, TEC-05, INF-01 | 月1000円以内のため無料枠前提。★案A: **Supabase**（Auth・Postgres・Edge Functions(TypeScript)が無料枠で揃う）／案B: Cloudflare Workers + D1（TypeScript、無料枠大）／案C: Python(FastAPI) を Cloud Run 等に置く（Python 経験が活きるが DB・Auth を別途用意） |
| Q-13 | 🟡 | Apple Developer Program（年 $99 ≒ 約15,000円）と Google Play（初回 $25）の費用は「月1000円」に含めるか？ いつ登録するか？ | TEC-13, NFR-001 | iPhone 実機への独自ビルドのインストール・TestFlight・ストア公開に必要。Expo Go での開発中は不要。★ストア公開準備の段階（M6）で登録し、月1000円の枠とは別に扱う |
| Q-14 | 🟡 | 分量の自動決定ルール：バーコード/OCR で読めた値が「100g 当たり」のとき、**内容量（1包装）を全部食べた**とみなして換算してよいか？ 複数個入り（例: 6個入りのお菓子）は？ | REQ-23, DAT-04 | ★既定は「1包装＝1食」。複数個入り・大容量は、確認画面のワンタップ選択（1/4・1/2・1個・全部 など）で直せるようにする（キーボード入力はさせない） |
| Q-15 | 🟡 | 読み取れなかった場合のフォールバックは？（栄養値または分量が取れない） | REQ-24 | 案: ①写真推定へ切り替えを提案 ②別の方式（バーコード→OCR）へ誘導 ③最終手段として手入力 ★①②を優先し、③は最小限の項目だけ |
| Q-16 | 🟡 | MVP の閲覧・編集の範囲は？ | REQ-04, REQ-11, REQ-12 | ★MVP: 日次合計＋食事一覧（4時区切り）、推定結果の確認・修正画面、食品/食事の削除。推移グラフ・目標値は MVP 外 |
| Q-17 | 🟡 | 認証を自分専用の段階（MVP）から入れるか？ | AUT-01, AUT-02 | バックエンドで Claude を呼ぶため、無認証だと API を他人に使われコストが発生するリスクがある。★最初から入れる（Sign in with Apple + Google。BaaS の Auth を使えば実装は軽い） |
| Q-18 | 🟢 | 開発は Windows と WSL のどちらで行うか？ | PRJ-10 | Expo は Windows でも動く。WSL から `/mnt/c` 上のリポジトリを触ると遅い。★Node/アプリは Windows、Python の PoC・スクリプトは WSL（リポジトリは WSL 側に置く選択肢もある） |
| Q-19 | 🟢 | テキスト入力（機能4）は MVP 外でよいか？（MVP はバーコード・OCR・写真推定） | REQ-04 | ★MVP 外。Q-15 のフォールバックとしての手入力とは別扱い |

## 解決済み

| ID | 質問 | 回答（2026-11-11） | 反映先 |
|---|---|---|---|
| — | 開発プロセス | 仕様駆動＋テスト駆動。Claude API 入出力はスキーマ定義＋検証テスト必須 | [ADR-0001](../adr/0001-spec-driven-and-test-driven.md) |
| Q-01 | 利用者範囲 | 将来はストアで一般公開を視野に入れる。直近は自分専用 | [ADR-0003](../adr/0003-phased-release-design.md) |
| Q-02 | リポジトリ独立化 | 独立させる → 対応済み（GitHub: `t-teieki/onaka-log`） | roadmap PRJ-01, PRJ-02 |
| Q-03 | MVP の入力方式 | バーコード・OCR・写真推定 | [scope.md](../01_requirements/scope.md) |
| Q-04 | 対象 OS | iOS・Android 両方。手元の実機は iOS のみ。開発 PC は Windows と WSL+Ubuntu | [non-functional.md](../01_requirements/non-functional.md), roadmap TEC-12〜14 |
| Q-05 | 技術経験 | Flutter・React Native は未経験。React・Python は経験あり | Q-11, Q-12 |
| Q-06 | 運用コスト | 月1000円程度まで。利用者は多くない想定 | [non-functional.md](../01_requirements/non-functional.md) NFR-001 |
| Q-07 | 画像の保存 | 保存しない。データ取得後すぐ破棄 | [ADR-0004](../adr/0004-no-image-retention.md) |
| Q-08 | 分量入力 | 人が入力せず読み取りで決める。UX 重視で入力の手間を極力なくす。MVP に含める。読み取れない場合は要検討 | [scope.md](../01_requirements/scope.md), Q-14, Q-15 |
| Q-09 | 1日の境界 | 4時 | [scope.md](../01_requirements/scope.md) |
| Q-10 | PoC サンプル | ユーザーが用意する | roadmap POC-03 |
