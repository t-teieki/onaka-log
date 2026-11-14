# F-012 栄養成分表示の読み取り（候補の作り方）

> ステータス: Draft
> 最終更新: 2026-11-14
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
