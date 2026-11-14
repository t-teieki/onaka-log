# F-013 写真からの推定（候補の作り方）

> ステータス: Draft
> 最終更新: 2026-11-14
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
