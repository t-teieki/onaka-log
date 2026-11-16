# F-012 栄養成分表示の読み取り（候補の作り方）

> ステータス: Draft
> 最終更新: 2026-11-16
> 関連: [ADR-0010](../../adr/0010-label-ocr-model-and-image-size.md), [contracts/llm/nutrition-label-ocr](../../../contracts/llm/nutrition-label-ocr/), [api.md](../../02_design/api.md) §3〜4, Q-26・Q-27
> API: `POST /v1/estimates/label` → `LabelEstimateResponse`

バックエンドが Claude の出力（出力スキーマ v0.3）から、保存用の食品の候補（`FoodItemDraft`）を作る規則。

## 要件

| ID | 要件 |
|---|---|
| F-012-01 | Claude の出力は、変換の前に完全版の出力スキーマと意味上のルール（[contracts/llm/README.md](../../../contracts/llm/README.md)）で検証する。合わなければ 422 estimation_failed（画像も出力もログに残さない） |
| F-012-02 | `status` が `ok` なら、`columns` の各列を表示の順に候補1件にする。`unreadable` / `not_nutrition_label` なら候補は空 |
| F-012-03 | 食品名は `product_name`（なければ「名称不明の食品」）。列に見出しがあれば「名前（見出し）」にする（例「ドーナツ（シュガー）」） |
| F-012-04 | 元の値の基準は列の `basis`（`type`・`amount`・`unit` はそのまま、`label_text` → `label`）。栄養値は列の kcal・P・F・C（食塩相当量は持たない）。null はそのまま |
| F-012-05 | 内容量は、出力の `net_content` の量か個数が読めていれば `known`（量・単位・個数をそのまま）、どちらもなければ `unknown` |
| F-012-06 | 出どころは `method = label_ocr`、`provider = claude`、`estimation` に使ったモデルID・`prompt_version`・出力スキーマの `$id`、`confidence` は出力の `confidence`。列が2つ以上のときだけ `column_index`（0 始まり）と `column_heading` を入れ、1列なら両方 null。`product_code`・`estimate_detail` は null |
| F-012-07 | 分量の既定は、基準が `per_piece` で内容量の個数が2以上なら `pieces`・1個（Q-27）、それ以外は `whole` |
| F-012-08 | `product_name`・`issues`・`notes` は出力をそのまま応答に入れる |

## Claude の呼び出し（API の層）

| ID | 要件 |
|---|---|
| F-012-09 | 要求の本文は `contracts/llm/nutrition-label-ocr/input.schema.json` で検証する。合わなければ 400 validation_error。ただし画像（`data_base64`）が 5,000,000 文字を超えるときは 413 payload_too_large |
| F-012-10 | Claude には、`prompt.md` のシステムプロンプト、画像ブロック1つ（テキストは付けない）、出力スキーマ（API が受け付けない数値・文字列の制約を取り除いたもの）を Structured Outputs（`output_config.format`）で渡す。モデルと effort は設定から読む |
| F-012-11 | 応答の `stop_reason` が `refusal` か `max_tokens`、本文が JSON として読めないときは 422 estimation_failed |
| F-012-12 | Claude に届かない・タイムアウト・Claude の 4xx（429 を含む）・5xx は 502 upstream_unavailable |
| F-012-13 | 候補の `source.estimation` には、使ったモデルID・`prompt.md` の `prompt_version`・出力スキーマの `$id` を入れる |
| F-012-14 | 画像・プロンプト・Claude の出力の中身はログに出さない（ADR-0004）。ログに出すのは用途・モデル・トークン数・応答時間・status・エラー種別 |

## アプリ側: 撮影と読み取り（2026-11-16、画面設計 3-4・4・4-1）

| ID | 要件 |
|---|---|
| F-012-15 | 入力方式の選択で「栄養成分表示」を選ぶか、バーコードの「栄養成分表示を撮る」を押すと撮影の画面を開く（記録日と追加先を引き継ぐ）。上部に「栄養成分表示を撮る」と撮り方の案内（正面から・近づけて・表示全体が入るように）を出す。カメラの許可がなければ F-011-14 と同じ |
| F-012-16 | 撮影した画像は長辺 1024px（それより小さければそのまま）の JPEG（品質 0.8）にし、base64 で `POST /v1/estimates/label`（`locale` は `ja-JP`）に送る。撮影と縮小で端末にできた一時ファイルはすぐ消す（ADR-0004・ADR-0010）。消すのはアプリのキャッシュにあるファイルだけ（写真の画像の選択、F-013-22 でも同じ） |
| F-012-17 | 読み取り中は画面全体に「読み取り中…」と「キャンセル」を出す。キャンセルしたら要求をやめ、結果は使わず撮影に戻る |
| F-012-18 | `ok` なら候補を確認・修正の画面に渡す（列が2つ以上なら列を選ぶ、F-020-07） |
| F-012-19 | `unreadable` なら「読み取れませんでした」「栄養成分表示を正面から、近づけて撮り直してください」と「撮り直す」「手入力する」「入力方法の選択に戻る」。`not_nutrition_label` なら「栄養成分表示が見つかりません」「栄養成分表示の部分を撮ってください」と「撮り直す」「入力方法の選択に戻る」 |
| F-012-20 | 422・502・500・通信の失敗なら「うまくいきませんでした」と「もう一度」（同じ画像を送り直す。画像はこの画面にいる間だけメモリに持つ）「入力方法の選択に戻る」。429 なら「少し時間をおいてください」と「閉じる」（撮影に戻る）。413 なら「画像が大きすぎます」「もう一度撮影してください」と「撮り直す」 |
