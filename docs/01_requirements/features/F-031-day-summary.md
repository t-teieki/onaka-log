# F-031 日次合計と食事一覧（API の振る舞い）

> ステータス: Draft
> 最終更新: 2026-11-14
> 関連: [api.md](../../02_design/api.md), [data-access-patterns.md](../../02_design/data-access-patterns.md) AP-01・AP-03, Q-09, Q-33
> API: `GET /v1/days/{record_date}`、`GET /v1/days/{record_date}/meals/{meal_id}`

## 要件

| ID | 要件 |
|---|---|
| F-031-01 | `GET /v1/days/{record_date}` は、その利用者のその記録日の食事を `eaten_at` の順に返す（`DaySummary`） |
| F-031-02 | 日次合計は食事の `totals` の和（小数第1位で四捨五入）。`totals_incomplete` は、どれかの食事が不明を含む栄養素（kcal・P・F・C の順） |
| F-031-03 | 食事がない日は `meals` が空、合計はすべて 0、`totals_incomplete` は空（200） |
| F-031-04 | `GET /v1/days/{record_date}/meals/{meal_id}` は食事1件を返す。なければ 404 not_found |
| F-031-05 | ほかの利用者の食事は、一覧にも1件の取得にも出ない（同じ記録日・食事ID でも見えない） |
| F-031-06 | `record_date` が `YYYY-MM-DD` の形でなければ 400 validation_error |
