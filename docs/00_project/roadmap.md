# ロードマップ兼チェックリスト

> **このファイルはプロジェクトの「現在地」を示す一次情報。** セッション開始時に必ず読み、終了時に更新する。
> 経緯・判断理由は [progress-log.md](progress-log.md) と [adr/](../adr/) に書き、ここにはチェック状態と成果物リンクだけを残す。

## 現在地

| 項目 | 内容 |
|---|---|
| 現在のマイルストーン | **M3 基本設計**（M2 PoC は 2026-11-13 に完了 → [poc-summary.md](../../poc/reports/poc-summary.md)。M1 の残り DAT-01 を先に進める） |
| 次にやること | ① push して GitHub で `contract` ワークフローが動くことを確認（ユーザー） ② INF-10 の残り（ユーザー: AWS の予算アラート・MFA・IAM） ③ 最初の機能の詳細仕様（F-xxx-yy）とテスト（赤）→ M4 ④ Dependabot（CIC-08） |
| ブロッカー | なし（技術スタックの主要な決定はそろった） |
| 最終更新 | 2026-11-13 |

## 凡例

- `[ ]` 未着手 / `[x]` 完了 / 末尾に `(WIP)` = 着手中 / `(SKIP: 理由)` = 不要と判断
- **ID** はドキュメント・テスト・コミットから参照する。採番済みIDは変更・再利用しない（削除時は SKIP にする）
- **★** = 他の多くの項目の前提になる重要決定（早めに決める）
- **成果物** = 完了の定義。そのファイルが書かれて合意されたら `[x]`

## マイルストーン概要

```mermaid
flowchart LR
    M0[M0 基盤] --> M1[M1 方針決定]
    M1 --> M2[M2 PoC 機能1-3]
    M1 --> M3[M3 基本設計]
    M2 -->|結果をフィードバック| M3
    M3 --> M4[M4 テスト設計・ハーネス・CI]
    M4 --> M5[M5 MVP実装 TDD]
    M5 --> M6[M6 リリース・運用]
    M6 --> M7[M7 拡張]
```

| MS | 名前 | 完了条件 | 主なカテゴリ |
|---|---|---|---|
| M0 | プロジェクト基盤 | リポジトリ・ドキュメント規約・外部記憶の仕組みが整う | PRJ, HNS(一部) |
| M1 | 方針決定 | ★項目（利用者範囲・MVPスコープ・ドメインの骨格）が決まる | REQ(★), DAT-01〜03 |
| M2 | PoC（機能1〜3） | 各方式の実用性が判定され、LLM契約の初版が固まる | POC, LLM(一部), TST-03 |
| M3 | 基本設計 | 技術スタック・アーキ・認証・データ・インフラ・画面・API契約が ADR 化 | ARC, TEC, AUT, DAT, INF, UIX, LLM |
| M4 | テスト設計・ハーネス・CI | 「このテストをパスするまで実装して」で実装を回せる状態 | TST, HNS, CIC |
| M5 | MVP実装 | MVPスコープの全機能がテスト緑で動く | IMP |
| M6 | リリース・運用 | 自分（＋想定ユーザー）が日常利用できる | SEC, OPS, CIC(配布) |
| M7 | 拡張 | バックログから順次 | EXT |

> M2（PoC）と M3（基本設計）の一部は並行可。ただし **PoC 結果でスコープや入力方式が変わり得る** ため、技術スタック（TEC）の最終決定は PoC 後が望ましい。

---

## PRJ: プロジェクト基盤・運営（M0）

- [x] **PRJ-01 ★** リポジトリの独立化（`onaka-log` 単独リポジトリ、改行コードは `.gitattributes` で LF に統一）
- [x] **PRJ-02** GitHub リモート作成 — `t-teieki/onaka-log`
- [ ] **PRJ-03** ブランチ戦略（例: GitHub Flow / trunk-based）、main 保護ルール
- [ ] **PRJ-04** コミット規約（例: Conventional Commits）・PR テンプレート（仕様ID記載欄）
- [x] **PRJ-05** フォルダ構成の初版 — 成果物: [folder-structure.md](folder-structure.md)
- [x] **PRJ-06** フォルダ構成の確定：`apps/api`（uv ワークスペース、`src/onaka_api/`）・`apps/mobile`（Expo、npm）・`infra/`（SAM）。`packages/` は作らない — 成果物: [ADR-0002](../adr/0002-monorepo-and-folder-structure.md) Accepted, [folder-structure.md](folder-structure.md)
- [ ] **PRJ-07** ドキュメント規約（記法・ID体系・テンプレート）の確定 — 成果物: [docs/README.md](../README.md), `docs/templates/`
- [ ] **PRJ-08** 機能仕様テンプレート・PoCレポートテンプレート作成
- [ ] **PRJ-09** 用語集の作成（食事 / 食品 / 推定 / 記録元 / 基準量 など） — 成果物: `glossary.md`
- [ ] **PRJ-10** 開発環境の前提：リポジトリは C ドライブ（問題が出たら WSL 側へ移す）、開発は WSL から（Q-18, Q-20）。ランタイムのバージョン管理・エディタ設定は未決 — 成果物: [dev-environment.md](dev-environment.md) (WIP)
- [ ] **PRJ-11** シークレット管理方針（`.env` / ローカル / CI / 本番の分離、`.env.example`）
- [ ] **PRJ-12** ライセンス・公開範囲（OSS にするか）
- [ ] **PRJ-13** タスクランナー（Makefile / just / Taskfile / npm scripts）— 「テスト実行」等を1コマンドに統一

## HNS: Claude Code ハーネス（M0〜M4）

- [x] **HNS-01** CLAUDE.md 初版（セッション開始/終了手順・開発ルール） — 成果物: [/CLAUDE.md](../../CLAUDE.md)
- [x] **HNS-02** 引継ぎ用 skill（`/handoff`） — 成果物: `.claude/skills/handoff/SKILL.md`
- [ ] **HNS-03** TDD 運用ルールの明文化：「テストが仕様」。実装フェーズではテスト・契約を変更しない。変更が必要なら仕様→契約→テストの順に戻る
- [ ] **HNS-04** テスト改変の機械的ガード（例: 実装タスク中に `tests/`・`contracts/` の編集を hook で警告/ブロック）
- [ ] **HNS-05** `.claude/settings.json`：permissions allowlist（テスト・lint 実行など）、PostToolUse hook（format / lint）
- [ ] **HNS-06** サブディレクトリ CLAUDE.md（`apps/mobile/`, `apps/api/`, `contracts/`, `poc/` ごとの規約）
- [ ] **HNS-07** カスタム skill 群の検討：`/spec`（機能仕様の起票）、`/spec-to-test`（仕様→テスト生成）、`/implement`（指定テストが緑になるまで実装）、`/adr`（ADR起票）
- [ ] **HNS-08** サブエージェント検討：仕様レビュー役、テスト作成役、契約整合性チェック役
- [ ] **HNS-09** MCP 連携の要否（GitHub、DB、デザインツールなど）
- [ ] **HNS-10** Claude Code GitHub Actions（PRレビュー自動化）の要否 → CIC と連携
- [ ] **HNS-11** 仕様⇔テストのトレーサビリティ確認スクリプト（全 F-xxx に対応テストがあるか）

## REQ: 要件定義（M1）

- [x] **REQ-01 ★** 利用者範囲：直近は自分専用、将来はストアで一般公開 — 成果物: [ADR-0003](../adr/0003-phased-release-design.md)
- [ ] **REQ-02 ★** プロダクトビジョン・提供価値・非ゴール — 成果物: `01_requirements/vision.md`
- [ ] **REQ-03** ペルソナ・主要ユースケース（いつ・どこで・何を記録するか）
- [x] **REQ-04 ★** MVP スコープ：入力方式はバーコード・OCR・写真推定・手入力（[ADR-0012](../adr/0012-manual-text-input.md)）。閲覧は日次合計＋食事一覧、確認・修正、削除 — 成果物: [scope.md](../01_requirements/scope.md)
- [x] **REQ-05** 機能一覧と機能ID採番（F-001〜F-045。MVP は F-001・F-010〜014・F-020〜021・F-030〜032） — 成果物: [features/README.md](../01_requirements/features/README.md)
- [ ] **REQ-06** 記録フロー仕様：入力方式選択 → 取得/推定 → 確認・修正 → 食事に追加 → 保存
- [x] **REQ-07** 1食に複数食品を紐づける仕様：1回の記録で1食事を作り、後から同じ食事に食品を足せる。削除は食品単位・食事単位、0件の食事は自動で削除（Q-31, Q-32） — 成果物: [scope.md](../01_requirements/scope.md)
- [ ] **REQ-08** 分量の扱い：人は入力せず読み取り・推定で決める方針（Q-08）。換算ルールは REQ-23 (WIP)
- [x] **REQ-09** 食事区分：MVP では持たず、時刻で並べる（Q-32） — 成果物: [scope.md](../01_requirements/scope.md)
- [x] **REQ-10** 日付の境界は 4:00、日本時間に固定。食べた日時は確認画面で変更可（過去も可）、保存後は不可（Q-33） — 成果物: [scope.md](../01_requirements/scope.md)
- [ ] **REQ-11** 閲覧仕様：日次合計・PFCバランス・食事ごと小計・週/月推移（グラフ種類）
- [x] **REQ-12** 編集・削除仕様：保存後の値の修正はしない（Q-31）。削除は確認なしで消し、約5秒「元に戻す」（Q-39） — 成果物: [screens/README.md](../02_design/screens/README.md) §3-9
- [ ] **REQ-13** 推定値の扱い：記録元・信頼度の表示、AI推定値と確定値の区別、修正履歴を残すか
- [ ] **REQ-14** 再利用機能：履歴から再記録・お気に入り・よく食べるもの（MVP か拡張か）
- [ ] **REQ-15** 目標値（カロリー・PFC）と達成度（MVP か拡張か）
- [ ] **REQ-16** 対象栄養素：カロリー・PFC のみか、食塩相当量・食物繊維・糖質等を将来拡張できる設計にするか
- [x] **REQ-17** オフライン要件：MVP ではオフラインの記録・閲覧はしない（推定はどれもオンラインが必要） — 成果物: [ADR-0015](../adr/0015-server-first-and-sync-estimation.md)
- [ ] **REQ-18** 非機能要件：コスト上限（月1000円）・画像非保存・対応OS は決定。応答時間などは PoC 後 — 成果物: [non-functional.md](../01_requirements/non-functional.md) (WIP)
- [x] **REQ-19** 画像の保持方針：推定後すぐ破棄し、どこにも保存しない — 成果物: [ADR-0004](../adr/0004-no-image-retention.md)
- [ ] **REQ-20** データのエクスポート・アカウント削除・データ削除要件
- [ ] **REQ-21** 多言語・単位系（日本語のみ? kcal 固定?）
- [ ] **REQ-22** アクセシビリティ・ダークモード
- [ ] **REQ-23** 分量の自動決定ルール：既定は「全部食べた」、ワンタップ選択（1/4・1/2 など）で修正可に決定。内容量が読めない場合の扱いは PoC 後 — 成果物: [scope.md](../01_requirements/scope.md) (WIP)
- [x] **REQ-24** 読み取れない場合：エラーダイアログを表示し、ホームの読み取り方式選択画面に戻る — 成果物: [scope.md](../01_requirements/scope.md)

## POC: PoC 機能1〜3（M2）

共通
- [x] **POC-01** PoC 計画（目的・合格基準・サンプルと正解データの形式・費用の上限） — 成果物: [poc/README.md](../../poc/README.md)
- [x] **POC-02** PoC 実行環境：WSL ＋ uv（Python 3.12）、anthropic SDK 2.8.0、jsonschema、pillow、httpx。共通処理は `poc/shared/`
- [x] **POC-03** 評価サンプル収集：バーコード5件・栄養成分表示4枚・料理写真5枚（計画の件数は集めにくいため縮小、ユーザー判断）。料理写真は正解なし（Q-28） — 成果物: `poc/samples/`（画像は Git 管理外、CSV は管理）
- [x] **POC-04** 評価スクリプト：PoC-1 照合・PoC-2 採点・PoC-3 正解なしの集計（整合・ばらつき・モデル間の差）、応答時間・費用 — 成果物: `poc/poc1-barcode/`, `poc/poc2-label-ocr/`, `poc/poc3-food-photo/`
- [x] **POC-05** PoC 結果レポートと判断：①条件付き採用 ②採用 ③採用（目安値） ④PoC 不要 — 成果物: [poc-summary.md](../../poc/reports/poc-summary.md), ADR-0009〜0012

機能1: バーコード照合
- [ ] **POC-11** 商品DB候補の洗い出し (SKIP: MVP は Open Food Facts（ADR-0009）。一致しない商品が多ければ見直す)
- [x] **POC-12** ヒット率・栄養値の充足率・パッケージ表示との一致度・基準量・内容量が取れる割合の計測（5件: 使える割合 100%、一致 4/5、内容量 1/5・1食分の量を含めると 4/5） — 成果物: [poc1-barcode.md](../../poc/reports/poc1-barcode.md)
- [x] **POC-13** 登録ミス時・内容量がない時の扱い：OCR へのワンタップ切り替え、内容量不明でも基準を付けて登録 — 成果物: [ADR-0009](../adr/0009-barcode-adoption-and-net-content.md)（未ヒット時は scope.md のとおりエラーダイアログ→方式選択）
- [ ] **POC-14** 端末でのバーコード読み取り（ML Kit 等）を実機で小さく確認 → M5 の実装時に行う

機能2: 栄養成分表示 OCR
- [ ] **POC-21** 方式比較（端末 OCR） (SKIP: Claude Vision で読める写真はすべて正確。読めない写真は上位モデルでも読めなかった)
- [x] **POC-22** 出力スキーマと Structured Outputs での強制（v0.3。表示の列ごとに `columns` で返す。null を許す enum は anyOf で書く） — 成果物: [contracts/llm/nutrition-label-ocr/](../../contracts/llm/nutrition-label-ocr/)
- [x] **POC-23** 精度計測：写真4枚。読める3枚は全モデル kcal・P・F・C 正確（逆光も可）。袋の曲面・斜め・小さい文字の1枚は全モデル unreadable（推測なし）、撮り直すと Haiku でも正確。複数列は全列を返して利用者が選ぶ（スキーマ v0.3、API で確認） — 成果物: [poc2-label-ocr.md](../../poc/reports/poc2-label-ocr.md)
- [x] **POC-24** 読み取り不可時の返し方：`unreadable` は全モデルで確認（数値は null、撮り直しの助言つき）。アプリでは撮り直しを案内する（Q-25）。`not_nutrition_label` はユーザー判断で検証しない

機能3: 撮影画像から推定
- [x] **POC-31** 出力スキーマ初版（料理名・複数品目への分解・推定量・カロリー・PFC・信頼度）：v0.1 で60回すべてスキーマ適合 — 成果物: [contracts/llm/food-photo-estimate/](../../contracts/llm/food-photo-estimate/)
- [x] **POC-32** 精度計測：正解データでの誤差は測らない（推定値をそのまま登録、Q-28）。整合（kcal≒4P+9F+4C、175/176品目）・再現性（Sonnet CV 6.6% → prompt 0.2.0 で 5.9%）・モデル間の差を計測 — 成果物: [poc3-food-photo.md](../../poc/reports/poc3-food-photo.md)
- [x] **POC-33** 1枚の写真に複数料理がある場合：品目に分解できる。prompt 0.2.0（料理・器単位、パック食品も入れる、水・お茶は入れない）で品目数が全写真3回とも一致、欠落なし — 成果物: [contracts/llm/food-photo-estimate/prompt.md](../../contracts/llm/food-photo-estimate/prompt.md)
- [ ] **POC-34** 推定不能時（食べ物でない・ぼやけ）の返し方 (SKIP: ユーザー判断で検証しない。スキーマとプロンプトに `not_food` / `unrecognizable` はある)

横断
- [x] **POC-41** モデル比較：OCR は Haiku 5.5・effort low（[ADR-0010](../adr/0010-label-ocr-model-and-image-size.md)）、写真推定は Sonnet 5.5・effort medium（[ADR-0011](../adr/0011-food-photo-model.md)）。テキスト推定は廃止（ADR-0012）
- [x] **POC-42** 画像の縮小：OCR は長辺 1024px で元サイズと同じ精度、768px で1か所誤読 → 1024〜1568px。写真推定は 1024px で問題なし（サイズ比較はしていない）
- [x] **POC-43** 1回あたりの費用：OCR Haiku 約0.1円、写真推定 Sonnet 約1.9円（月90回で約170円）。費用の大半は入力（画像＋スキーマ＋プロンプト） — 成果物: [poc-summary.md](../../poc/reports/poc-summary.md)
- [ ] **POC-44** プロンプトキャッシュの効果 (SKIP: PoC では未検証。実装時に LLM-10 で確認する)

## LLM: Claude API 利用設計（M2〜M3）

- [ ] **LLM-01 ★** Claude を使う箇所の確定：OCR構造化 / 写真推定 / ~~テキスト入力推定~~（廃止、ADR-0012） / （任意）バーコード未ヒット補完 / （将来）アドバイス — 成果物: `02_design/llm/README.md`
- [x] **LLM-02 ★** 呼び出し経路：**バックエンド経由**に決定（APIキー保護・コスト制御） — 成果物: [ADR-0003](../adr/0003-phased-release-design.md)
- [x] **LLM-03 ★** 用途ごとの入出力契約（JSON Schema）：OCR は出力 v0.3・prompt 0.2.0、写真推定は出力 v0.1・prompt 0.2.0（PoC の結果で改訂）。テキスト推定は ADR-0012 で削除 — 成果物: [contracts/llm/](../../contracts/llm/README.md)
- [x] **LLM-04** 出力の強制方式：Structured Outputs（`output_config.format`）。スキーマは制約込みの完全版で書き、API 未対応の制約は SDK が除去してクライアント側で検証 — 成果物: [contracts/llm/README.md](../../contracts/llm/README.md)
- [x] **LLM-05** 不確実性の表現：`status`（エラー種別）・`confidence`・`issues`・`assumptions`。PoC で `unreadable` や confidence が実際に使われることを確認 — 成果物: [contracts/llm/](../../contracts/llm/README.md)
- [ ] **LLM-06** 数値の単位・基準量・丸め規則の統一（kcal, g、小数何桁）
- [x] **LLM-07** プロンプトのバージョン管理：`prompt.md` の `prompt_version` とスキーマ `$id` のバージョン。推定結果にモデルIDと一緒に記録する — 成果物: [contracts/llm/README.md](../../contracts/llm/README.md)
- [ ] **LLM-08** モデル・effort の設定外部化（用途ごとに切替可能に）
- [ ] **LLM-09** タイムアウト・リトライ・レート制限・`refusal` 等の stop_reason ハンドリング方針
- [ ] **LLM-10** コスト制御：ユーザーごと回数制限、画像サイズ上限、キャッシュ
- [ ] **LLM-11** プロンプトインジェクション対策：画像内・説明文内の指示に従わないルールを v0.1 プロンプトに入れた。出力はスキーマ検証済みのみ採用。PoC で確認 (WIP)
- [ ] **LLM-12** ログ方針（入出力・トークン数・レイテンシを記録、画像そのものは残すか）
- [ ] **LLM-13** LLM プロバイダ抽象化（推定エンジンを interface 化し差し替え可能に）
- [ ] **LLM-14** 回帰評価（eval）：プロンプト/モデル変更時に PoC データセットで精度比較 → TST-07

## ARC: アーキテクチャ（M3）

- [x] **ARC-01 ★** 全体構成：Expo アプリ → API Gateway（JWT）→ Lambda（FastAPI）→ DynamoDB / Claude / Open Food Facts、Cognito、SSM — 成果物: [architecture.md](../02_design/architecture.md)
- [x] **ARC-02 ★** データの主たる置き場所：サーバーファースト（Q-35） — 成果物: [ADR-0015](../adr/0015-server-first-and-sync-estimation.md)
- [x] **ARC-03 ★** バックエンド形態：AWS サーバーレス（API Gateway + Lambda + Cognito） — 成果物: [ADR-0007](../adr/0007-backend-aws-serverless.md)
- [x] **ARC-04** API スタイル：REST + OpenAPI 3.1。食品の形は contracts/domain を参照 — 成果物: [ADR-0016](../adr/0016-api-rest-openapi.md), [contracts/api/openapi.yaml](../../contracts/api/openapi.yaml), [api.md](../02_design/api.md)
- [ ] **ARC-05** レイヤ構成：ドメイン・ユースケース・アダプタの分離（ヘキサゴナル / クリーンアーキ）
- [ ] **ARC-06** 推定方式のプラグイン化：`Estimator`（barcode / label-ocr / photo / text / manual）共通インターフェース → 新方式追加に強く
- [x] **ARC-07** 推定処理は同期 API（PoC の応答は p90 約5秒）。推定と保存は別の API — 成果物: [ADR-0015](../adr/0015-server-first-and-sync-estimation.md)
- [x] **ARC-08** エラー体系：`{"error": {"code", "message"}}`、code 11種と HTTP の対応。画面の文言はアプリが code から決める。読めない等の推定結果は 200 の status — 成果物: [api.md](../02_design/api.md) §5
- [x] **ARC-09** API バージョニング：パスの `/v1`。互換を壊す変更は `/v2`、古い版は一定期間残す — 成果物: [ADR-0016](../adr/0016-api-rest-openapi.md)
- [ ] **ARC-10** 設定管理・Feature flag（新入力方式の段階公開など）
- [ ] **ARC-11** ロギング・監視・トレース・クラッシュレポート
- [ ] **ARC-12** 拡張シナリオ検証：栄養素追加 / 新入力方式 / LLM差し替え / 複数ユーザー共有 / ヘルスケア連携 に設計が耐えるか

## TEC: 技術スタック（M3、PoC 後に確定）

- [x] **TEC-01 ★** モバイル：React Native（Expo）+ TypeScript — 成果物: [ADR-0005](../adr/0005-mobile-react-native-expo.md)
- [ ] **TEC-02** 対応OS：iOS・Android 両方に決定。最小OSバージョンは未決 (WIP)
- [x] **TEC-03** 状態管理・ルーティング・DI：Expo Router、TanStack Query、React の state / Context。DI コンテナは使わない — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [ ] **TEC-04** 端末DB (SKIP: サーバーファーストのため使わない、ADR-0015)
- [x] **TEC-05 ★** バックエンド言語・FW：Python（FastAPI）を Lambda で動かす — 成果物: [ADR-0007](../adr/0007-backend-aws-serverless.md)
- [x] **TEC-06 ★** サーバDB：DynamoDB（ORM・マイグレーションツールは不要、アイテムの形は JSON Schema で定義） — 成果物: [ADR-0008](../adr/0008-database-dynamodb.md)
- [x] **TEC-07** 型生成：openapi-typescript ＋ openapi-fetch（OpenAPI を bundle してから生成）。バックエンドの Pydantic モデルは手書きし契約テストで守る — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [x] **TEC-08** テストFW：pytest・TestClient＋DynamoDB Local、Jest（jest-expo）＋RNTL、E2E は Maestro — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [x] **TEC-09** Lint / Formatter / 型：Ruff・mypy（domain は strict）、TypeScript strict・ESLint・Prettier、cfn-lint — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [x] **TEC-10** カメラ・バーコード・画像：expo-camera（EAN-13/8）、expo-image-manipulator — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [ ] **TEC-11** グラフ描画ライブラリ (SKIP: MVP では推移グラフを作らない。次期に選ぶ)
- [x] **TEC-12 ★** Mac なしでの確認：Apple Developer Program は最低優先（Q-41）。日常は Android エミュレーターの development build、iPhone は Expo Go で見た目の確認。iOS の配布は登録後に EAS Build＋Submit — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [x] **TEC-13** 登録時期：Apple Developer Program はストア公開を決めたとき（Q-41）。Google Play も同様 — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [x] **TEC-14** Android の検証：Windows の Android Studio のエミュレーター（実機は将来） — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)

## AUT: 認証・認可（M3）

- [x] **AUT-01 ★** 認証の導入時期：最初から入れる — 成果物: [ADR-0006](../adr/0006-auth-from-day-one.md)
- [x] **AUT-02** 認証方式：Sign in with Apple + Google（メール＋パスワードは作らない） — 成果物: [ADR-0006](../adr/0006-auth-from-day-one.md)
- [x] **AUT-03** IdP：Amazon Cognito — 成果物: [ADR-0007](../adr/0007-backend-aws-serverless.md)（Expo からの Apple / Google ログイン連携は実装時に検証）
- [ ] **AUT-04** トークン管理：expo-secure-store に保存と決定。更新・失効の扱いは実装時 (WIP)
- [ ] **AUT-05** 認可：全データを user_id でスコープ（行レベルセキュリティ等）
- [ ] **AUT-06** 将来の権限拡張：家族/トレーナーとの共有、管理者ロール
- [ ] **AUT-07** API 不正利用対策：レート制限、App Attest / Play Integrity
- [ ] **AUT-08** アカウント削除フロー（ストア要件）
- 成果物: `02_design/auth.md`

## DAT: データ管理（M1〜M3）

- [x] **DAT-00 ★** アクセスパターンの洗い出し：AP-01〜AP-11。ADR-0008 のキー案（ソートキーは `記録日#時刻#食事ID`）で MVP のパターンが足りる — 成果物: [data-access-patterns.md](../02_design/data-access-patterns.md)
- [x] **DAT-01 ★** ドメインモデル：User / Meal / FoodItem（元の値・分量・食べた量の値・出どころ）/ Nutrients。ルール DM-01〜DM-09 — 成果物: [domain-model.md](../02_design/domain-model.md), [contracts/domain/meal.schema.json](../../contracts/domain/meal.schema.json), [ADR-0013](../adr/0013-data-model-keys-and-ids.md)
- [x] **DAT-02 ★** Meal の合計値：書き込み時に計算して保存。null は 0 として足し、不明を含む栄養素を `totals_incomplete` に残す — 成果物: [domain-model.md](../02_design/domain-model.md)
- [x] **DAT-03** 栄養値の型と精度：保存は小数第1位（四捨五入）、null = 不明。拡張栄養素は REQ-16 で（スキーマの版を上げて足す） — 成果物: [data-model.md](../02_design/data-model.md)
- [x] **DAT-04** 分量モデル：元の値（基準・内容量）× 倍率（全部・割合・個数）= 食べた量の値。元の値と食べた量の値の両方を保存 — 成果物: [domain-model.md](../02_design/domain-model.md)
- [x] **DAT-05** AI推定の記録：食品ごとにモデルID・prompt_version・スキーマの ID と元の値を保存。Claude の生出力全体と画像は保存しない — 成果物: [domain-model.md](../02_design/domain-model.md)
- [x] **DAT-06** ID 方式：UUIDv7 をアプリで作る（再送しても同じ ID、条件付き書き込みで二重保存を防ぐ） — 成果物: [data-model.md](../02_design/data-model.md), ADR-0013
- [x] **DAT-07** 日時の保存：eaten_at は日本時間の ISO 8601、record_date は 4時間引いた日付、作成・更新は UTC — 成果物: [data-model.md](../02_design/data-model.md)
- [x] **DAT-08** 削除：物理削除。更新履歴は持たない（保存後の修正なし、Q-31） — 成果物: [data-model.md](../02_design/data-model.md)
- [ ] **DAT-09** 同期と競合解決 (SKIP: サーバーファーストのため不要、ADR-0015)
- [ ] **DAT-10** 商品マスタ：外部DB結果のキャッシュ、ユーザー登録商品、共有するか個人別か
- [ ] **DAT-11** 画像ストレージ (SKIP: 画像を保存しないため。ADR-0004)
- [ ] **DAT-12** マイグレーション戦略（サーバ・端末とも）、シードデータ
- [ ] **DAT-13** バックアップ・リストア・エクスポート形式（CSV / JSON）
- [ ] **DAT-14** 個人情報・健康関連情報の分類と取扱い
- 成果物: `02_design/data-model.md`

## INF: インフラ（M3）

- [x] **INF-01 ★** ホスティング先：AWS、東京リージョン（ap-northeast-1）を基本 — 成果物: [ADR-0007](../adr/0007-backend-aws-serverless.md)
- [ ] **INF-10 ★** AWS アカウントの準備：アカウント作成は済み。残りは、プランの確認（Free プランなら6か月で閉じられるため Paid への切り替え時期を決める）、AWS Budgets の予算アラート、root ユーザーの MFA、作業用 IAM ユーザー/ロール (WIP)
- [x] **INF-02** 環境構成：local（uvicorn＋DynamoDB Local）/ dev / prod。dev と prod は別スタック・別テーブル・別 Cognito — 成果物: [ADR-0014](../adr/0014-iac-aws-sam.md)
- [x] **INF-03** IaC の方式：AWS SAM（Q-34） — 成果物: [ADR-0014](../adr/0014-iac-aws-sam.md), [比較](../02_design/discussions/iac-comparison.md)
- [ ] **INF-04** シークレット管理：Claude API キーは SSM Parameter Store の SecureString（手で入れる）、CI は GitHub OIDC と決定。具体的な設定は実装時 (WIP)
- [ ] **INF-05** ローカル開発環境（エミュレータ、ローカルDB、モックサーバ）
- [ ] **INF-06** コスト見積り（無料枠・Claude API）と予算アラート。上限は月1000円（NFR-001、目安は non-functional.md）
- [ ] **INF-07** 監視・アラート・ログ保管
- [ ] **INF-08** バックアップと復旧手順
- [ ] **INF-09** ドメイン・TLS（必要なら）
- 成果物: `02_design/infra.md`

## UIX: 画面設計・UX（M3）

- [x] **UIX-01** 画面一覧と画面遷移図 — 成果物: [screens/README.md](../02_design/screens/README.md)
- [x] **UIX-02** ホーム：1日の合計・食事一覧・「記録する」ボタン（Q-36） — 成果物: [screens/README.md](../02_design/screens/README.md) §3-1
- [x] **UIX-03** 記録フロー：記録する → 入力方式の選択 → 読み取り・撮影・入力 → 推定中 → 確認・修正 → 保存。エラー時は撮り直す・手入力・方式選択へ — 成果物: [screens/README.md](../02_design/screens/README.md) §2
- [x] **UIX-04** 確認・修正画面：出どころ・基準・内容量不明の表示、列の選択（先頭を選択済み、Q-37）、分量のワンタップ、品目を外す、日時の変更 — 成果物: [screens/README.md](../02_design/screens/README.md) §3-5
- [x] **UIX-05** 食事の詳細：食品の追加・削除（確認なし＋元に戻す、Q-39）。値の修正はしない（Q-31） — 成果物: [screens/README.md](../02_design/screens/README.md) §3-6, §3-9
- [ ] **UIX-06** 履歴（カレンダー / 日付移動）・推移グラフ
- [ ] **UIX-07** 設定：MVP はサインアウトと版の表示だけ（目標値・データ管理は次期以降、アカウント削除は公開前） — 成果物: [screens/README.md](../02_design/screens/README.md) §3-7 (WIP)
- [ ] **UIX-08** オンボーディング・カメラ権限要求・権限拒否時の導線
- [x] **UIX-09** ローディング・エラー・空状態・オフライン・削除の取り消しのパターンと、エラーダイアログの文言 — 成果物: [screens/README.md](../02_design/screens/README.md) §4
- [x] **UIX-10** ワイヤーフレーム：MVP は文書内のテキストの図。見た目を詰める段階で HTML モック — 成果物: [screens/README.md](../02_design/screens/README.md) §6
- [ ] **UIX-11** デザインシステム（色・タイポ・コンポーネント）、ダークモード
- [x] **UIX-12** 手数の目標：写真4・バーコード3・成分表示4タップ — 成果物: [screens/README.md](../02_design/screens/README.md) §5

## TST: テスト戦略（M2〜M4）

- [x] **TST-01 ★** テスト戦略：9層（契約・バックエンド単体・API・モバイル・インフラ・dev 確認・E2E・実 API スモーク・LLM 回帰）の責務と実行タイミング — 成果物: [strategy.md](../03_testing/strategy.md)
- [x] **TST-02 ★** トレーサビリティ規約：`@pytest.mark.spec("DM-03")`、対応表と検査は `tools/trace.py`（DM は必須、MVP の F は警告） — 成果物: [traceability.md](../03_testing/traceability.md)
- [x] **TST-03 ★** 契約テスト：例の適合・不適合、Structured Outputs 互換、意味上のルールを検査（pytest、88件） — 成果物: [tests/contract/](../../tests/contract/README.md)
- [x] **TST-04** Claude API のモック方針：PoC の出力を記録した応答として `apps/api/tests/fixtures/llm/` に置き、呼び出しを差し替える。失敗（リフューザル・途切れ・違反・429）も再現 — 成果物: [strategy.md](../03_testing/strategy.md) §3-2
- [ ] **TST-05** 実API スモークテスト：`@pytest.mark.live`、既定では動かさない、1回数円以内と決定。テストは実装時 — 方針: [strategy.md](../03_testing/strategy.md) §3-2 (WIP)
- [ ] **TST-06** API 契約テスト：API テストで応答を openapi.yaml で検証、パスとメソッドの一覧の一致も検査と決定。テストは実装時 — 方針: [strategy.md](../03_testing/strategy.md) §3-3 (WIP)
- [ ] **TST-07** LLM 回帰評価：PoC のサンプルとスクリプトを流用、プロンプト・モデル変更時に手動で実行と決定。`tests/eval/` は実装時 — 方針: [strategy.md](../03_testing/strategy.md) §3-2 (WIP)
- [x] **TST-08** E2E：Maestro（Android エミュレーター）。iOS の E2E は対象外 — 成果物: [ADR-0017](../adr/0017-libraries-and-tooling.md)
- [x] **TST-09** テストデータ：画像は Git に入れない。単体・API テストはダミー画像と記録した応答、実画像は実 API スモークと回帰評価だけ — 成果物: [strategy.md](../03_testing/strategy.md) §3-4
- [x] **TST-10** カバレッジ：行カバレッジの数値目標は置かず、仕様の ID とテストの対応で見る。`domain/` だけ行カバレッジの目安 90% — 成果物: [strategy.md](../03_testing/strategy.md) §4
- [x] **TST-11** テスト先行の手順：仕様（F-xxx-yy）→ 契約 → spec 付きテスト（赤を確認してコミット）→ 実装（緑）→ trace.py --check — 成果物: [strategy.md](../03_testing/strategy.md) §5

## CIC: CI/CD（M4〜M6）

- [x] **CIC-01** CI 基盤：GitHub Actions。Action は SHA で固定、権限は最小 — 成果物: [.github/workflows/contract.yml](../../.github/workflows/contract.yml), [ci-cd.md](../04_operations/ci-cd.md)
- [ ] **CIC-02** PR 時のジョブ：契約テスト・PoC の単体テスト・trace.py --check は `contract` ワークフローで実施（パスフィルタあり）。lint・型・アプリのテスト・ビルドは実装時に足す — 成果物: [ci-cd.md](../04_operations/ci-cd.md) (WIP)
- [ ] **CIC-03** 契約変更時に全関係者（mobile / api / tests）のテストを走らせる仕組み
- [ ] **CIC-04** LLM 実API テスト・eval の実行タイミング（手動トリガー / 夜間）とコスト上限
- [ ] **CIC-05** バックエンドの自動デプロイ（main → staging、タグ → prod）とDBマイグレーション
- [ ] **CIC-06** モバイルのビルドと配布（EAS / Codemagic / fastlane、TestFlight / Play 内部テスト）
- [ ] **CIC-07** バージョニング・リリースノート自動化
- [ ] **CIC-08** 依存更新（Dependabot / Renovate）・セキュリティスキャン
- [ ] **CIC-09** シークレットの CI 受け渡し（OIDC 推奨）
- [ ] **CIC-10** Claude による PR レビュー自動化（HNS-10）
- 成果物: `04_operations/ci-cd.md`

## SEC: セキュリティ・プライバシー・法務（M3〜M6）

- [ ] **SEC-01** APIキー保護（クライアントに持たせない）
- [ ] **SEC-02** 通信・保存データの暗号化
- [ ] **SEC-03** 画像・食事データを外部（Anthropic・商品DB）に送ることの説明と同意
- [ ] **SEC-04** プライバシーポリシー・利用規約（REQ-01 で配布する場合）
- [ ] **SEC-05** 医療・健康アドバイスではない旨の免責
- [ ] **SEC-06** 外部データのライセンス表記（例: Open Food Facts は ODbL）
- [ ] **SEC-07** ストア審査要件（アカウント削除、権限説明文、ヘルスケア関連）
- [ ] **SEC-08** 脅威モデリング（簡易）

## OPS: 運用（M6）

- [ ] **OPS-01** リリース手順・ロールバック手順
- [ ] **OPS-02** 障害時対応（Claude API 障害時のフォールバック：手入力へ誘導）
- [ ] **OPS-03** コスト監視と上限到達時の挙動
- [ ] **OPS-04** 推定精度の継続モニタリング（ユーザー修正率など）

## IMP: MVP 実装（M5）

> M3・M4 完了後に、機能仕様（F-xxx）単位でタスク化する。各タスクは「対応テストを先に用意 → 赤を確認 → 実装 → 緑」。

- [ ] **IMP-01** ウォーキングスケルトン（アプリ起動 → API 疎通 → DB 保存 → CI 緑）
- [ ] **IMP-02** ドメイン層（Meal / FoodItem / 合計計算）
- [ ] **IMP-03** 手入力（食品名と kcal・PFC）による記録（[ADR-0012](../adr/0012-manual-text-input.md)）
- [ ] **IMP-04** 閲覧（日次合計・一覧）
- [ ] **IMP-05** 編集・削除
- [ ] **IMP-06** バーコード照合
- [ ] **IMP-07** 栄養成分表示 OCR
- [ ] **IMP-08** 写真推定
- [ ] **IMP-09** 認証
- [ ] **IMP-10** 推移表示

## EXT: 拡張バックログ（M7〜、優先度未定）

- [ ] **EXT-01** 目標値と達成度
- [ ] **EXT-02** 履歴から再記録・お気に入り・テンプレート食事
- [ ] **EXT-03** 栄養素拡張（食塩・食物繊維・糖質 等）
- [ ] **EXT-04** 体重記録・ヘルスケア（HealthKit / Health Connect）連携
- [ ] **EXT-05** 公的食品成分データ（例: 日本食品標準成分表）を使ったテキスト入力の精度向上・食品検索
- [ ] **EXT-06** AI による食事アドバイス・振り返り
- [ ] **EXT-07** 家族・トレーナーとの共有
- [ ] **EXT-08** ウィジェット・通知（記録忘れリマインド）
- [ ] **EXT-09** Web 版・管理画面
