# F-030 食事への追加・保存（API の振る舞い）

> ステータス: Draft
> 最終更新: 2026-11-14
> 関連: [api.md](../../02_design/api.md), [domain-model.md](../../02_design/domain-model.md), [data-model.md](../../02_design/data-model.md), Q-32, Q-33, ADR-0013, ADR-0015
> API: `POST /v1/meals`、`POST /v1/days/{record_date}/meals/{meal_id}/items`

## 要件

| ID | 要件 |
|---|---|
| F-030-01 | `POST /v1/meals` は本文を `MealCreateRequest` のスキーマで検証し、合わなければ 400 validation_error |
| F-030-02 | 倍率・食べた量の値・記録日・合計はバックエンドが計算する（ドメイン、DM-01〜09）。ルールに違反すれば 400 validation_error（`message` に違反したルールの ID を含める） |
| F-030-03 | 保存した食事を 201 で返す。`version` は 1、`created_at` と `updated_at` は保存した時刻（UTC）、`user_id` はトークンの `sub` |
| F-030-04 | 同じ利用者で同じ `meal_id` の食事がすでにあれば 409 meal_already_exists（再送。二重に保存しない） |
| F-030-05 | `POST …/meals/{meal_id}/items` は本文を `AddItemRequest` で検証し、食品を足した食事を 200 で返す（`version` +1、合計を計算し直す、`updated_at` を更新） |
| F-030-06 | 食品を足すとき、食事がなければ 404 not_found、`expected_version` が今の版と違えば 409 version_conflict、同じ `item_id` があれば 409 item_already_exists |
| F-030-07 | 同じ食事への更新が同時に起きても、後から書いた方が先の更新を消さない（DynamoDB の条件付き書き込みで、書き込みの時点の版を確かめる） |
