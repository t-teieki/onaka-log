# F-032 食事・食品の削除（API の振る舞い）

> ステータス: Draft
> 最終更新: 2026-11-14
> 関連: [api.md](../../02_design/api.md), [screens](../../02_design/screens/README.md) §3-9, Q-31, Q-39
> API: `DELETE /v1/days/{record_date}/meals/{meal_id}`、`DELETE /v1/days/{record_date}/meals/{meal_id}/items/{item_id}?expected_version=`

「元に戻す」（Q-39）はアプリが削除 API を送るのを遅らせて実現するので、API に取り消しはない。

## 要件

| ID | 要件 |
|---|---|
| F-032-01 | 食事の削除は 204。なければ 404 not_found。物理削除（ADR-0013） |
| F-032-02 | 食品の削除は、消した後の食事を 200 で返す（`meal_deleted: false`、`version` +1、合計を計算し直す） |
| F-032-03 | 最後の1件の食品を消したら食事ごと削除し、`meal_deleted: true`、`meal: null` を 200 で返す（Q-31） |
| F-032-04 | 食事がない、または食品がなければ 404 not_found。`expected_version` が今の版と違えば 409 version_conflict |
| F-032-05 | ほかの利用者の食事は消せない（404 not_found） |
