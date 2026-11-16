# F-013 写真からの推定（候補の作り方とアプリの撮影）

> ステータス: Draft
> 最終更新: 2026-11-16
> 関連: [ADR-0011](../../adr/0011-food-photo-model.md), [contracts/llm/food-photo-estimate](../../../contracts/llm/food-photo-estimate/), [api.md](../../02_design/api.md) §3〜4, Q-28
> API: `POST /v1/estimates/photo` → `PhotoEstimateResponse`

バックエンドが Claude の出力（出力スキーマ v0.1、prompt 0.2.0）から、保存用の食品の候補（`FoodItemDraft`）を作る規則。

## 要件

| ID | 要件 |
|---|---|
| F-013-01 | Claude の出力は、変換の前に完全版の出力スキーマと意味上のルール（`status` が `ok` 以外なら `items` は空・`meal_name` は null、`ok` なら `items` が1件以上）で検証する。合わなければ 422 estimation_failed |
| F-013-02 | `status` が `ok` なら、`items` の各品目を順に候補1件にする。`not_food` / `unrecognizable` なら候補は空 |
| F-013-03 | 食品名は品目の `name` |
| F-013-04 | 元の値の基準は `as_estimated`（量・単位・表記は null）、内容量は null、栄養値は品目の kcal・P・F・C |
| F-013-05 | `estimate_detail` は品目の量の表現（`amount.value` → `amount_value`、`amount.unit` → `amount_unit`）と `estimated_weight_g` |
| F-013-06 | 出どころは `method = photo`、`provider = claude`、`estimation` に使ったモデルID・`prompt_version`・出力スキーマの `$id`、`confidence` は品目の `confidence`。`product_code`・列の番号と見出しは null |
| F-013-07 | 分量の既定は `whole` |
| F-013-08 | `meal_name`・`assumptions`・`notes` は出力をそのまま応答に入れる |

## Claude の呼び出し（API の層）

| ID | 要件 |
|---|---|
| F-013-09 | 要求の本文は `contracts/llm/food-photo-estimate/input.schema.json` で検証する。合わなければ 400 validation_error。ただし画像（`data_base64`）が 5,000,000 文字を超えるときは 413 payload_too_large |
| F-013-10 | Claude には、`prompt.md` のシステムプロンプト、画像ブロック1つ（テキストは付けない）、出力スキーマ（API が受け付けない数値・文字列の制約を取り除いたもの）を Structured Outputs（`output_config.format`）で渡す。モデルと effort は設定から読む |
| F-013-11 | 応答の `stop_reason` が `refusal` か `max_tokens`、本文が JSON として読めないときは 422 estimation_failed |
| F-013-12 | Claude に届かない・タイムアウト・Claude の 4xx（429 を含む）・5xx は 502 upstream_unavailable |
| F-013-13 | 候補の `source.estimation` には、使ったモデルID・`prompt.md` の `prompt_version`・出力スキーマの `$id` を入れる |
| F-013-14 | 画像・プロンプト・Claude の出力の中身はログに出さない（ADR-0004）。ログに出すのは用途・モデル・トークン数・応答時間・status・エラー種別 |

## アプリの撮影と推定（画面設計 3-4、IMP-08）

| ID | 要件 |
|---|---|
| F-013-15 | 入力方式の選択で「写真」を選ぶと撮影の画面を開く（記録日と追加先を引き継ぐ）。上部に「料理を撮る」。カメラの許可がなければ F-011-14 と同じ（理由は「料理の栄養を推定するためにカメラを使います」） |
| F-013-16 | 撮影した画像は F-012-16 と同じく長辺 1024px の JPEG（品質 0.8）にし、base64 で `POST /v1/estimates/photo`（`locale` は `ja-JP`）に送る。一時ファイルはすぐ消す（ADR-0004） |
| F-013-17 | 推定中は画面全体に「推定中…」と「キャンセル」を出す。キャンセルしたら要求をやめ、結果は使わず撮影に戻る |
| F-013-18 | `ok` なら品目ごとの候補を確認・修正の画面に渡す（品目ごとにカード、F-020-08） |
| F-013-19 | `not_food` なら「食べ物が見つかりません」「料理全体が入るように撮ってください」と「撮り直す」「入力方法の選択に戻る」。`unrecognizable` なら「料理を判別できませんでした」「明るい場所で、料理全体が入るように撮り直してください」と「撮り直す」「手入力する」「入力方法の選択に戻る」 |
| F-013-20 | 422・502・500・通信の失敗・429・413 は F-012-20 と同じ（「もう一度」は同じ画像を送り直す） |
| F-013-21 | 食事の詳細の「食品を追加」（追加モード）でも使える。1枚の写真から推定した品目（外したもの以外）を、まとめて今の食事に足す（F-020-05） |
