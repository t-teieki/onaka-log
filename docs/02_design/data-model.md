# データモデル（DynamoDB）

> ステータス: Draft
> 最終更新: 2026-11-14
> 関連: DAT-01〜DAT-08, [ADR-0008](../adr/0008-database-dynamodb.md), [ADR-0013](../adr/0013-data-model-keys-and-ids.md), [domain-model.md](domain-model.md), [data-access-patterns.md](data-access-patterns.md)
> 契約（SSOT）: [contracts/domain/meal.schema.json](../../contracts/domain/meal.schema.json)

## 1. テーブル

テーブルは1つ（`onaka-log-<環境>`、例: `onaka-log-dev`）。MVP のアイテムの種類は食事（Meal）だけ。

| 属性 | 型 | 例 | 説明 |
|---|---|---|---|
| `PK` | S | `USER#3f1c...`（Cognito の sub） | パーティションキー |
| `SK` | S | `MEAL#2026-11-13#12:30:05#0190f3a2-...` | ソートキー。`MEAL#記録日#時刻#食事ID` |
| `entity` | S | `meal` | アイテムの種類（将来の種類追加に備える） |
| （ドメインの属性） | | | `meal.schema.json` の各プロパティをそのまま属性にする（`meal_id`, `user_id`, `eaten_at`, `record_date`, `items`, `totals`, `totals_incomplete`, `version`, `created_at`, `updated_at`） |

- `SK` の時刻は `eaten_at` の日本時間の時刻（`HH:MM:SS`）。記録日と時刻の順に並ぶので、1日分を時刻順に取れる
- `items` は List of Map で食事の中に埋め込む（ADR-0008）。1食事は数 KB で、上限の 400KB に十分収まる
- 数値は DynamoDB の Number（Python では `Decimal`）。小数第1位までにして保存する
- GSI は MVP では作らない（AP-10 よく食べる食品などを作るときに検討する）
- 将来の種類の例: 日次サマリ `SK = DAY#2026-11-13`（AP-09 推移グラフ）、利用者設定 `SK = PROFILE`

## 2. アクセスパターンごとの操作

| AP | 操作 | 条件・注意 |
|---|---|---|
| AP-01 1日分 | `Query`: `PK = USER#<sub>` かつ `begins_with(SK, "MEAL#2026-11-13#")` | 時刻順で返る。日次合計は各食事の `totals` をコードで足す |
| AP-02 保存 | `PutItem`（`attribute_not_exists(PK)` を条件にする） | 同じ食事ID での二重保存（再送）を防ぐ。`version = 1` |
| AP-03 1件 | `GetItem`: `PK`, `SK` | アプリは一覧で受け取った `SK`（または記録日・時刻・食事ID）を持っておく |
| AP-04 削除 | `DeleteItem`: `PK`, `SK` | 物理削除（DAT-08） |
| AP-05 食品を消す | `UpdateItem` で `items` と合計を置き換え、`version` を +1（`version = :読んだ値` を条件にする）。残りが0件なら `DeleteItem` | 楽観的ロック。条件に失敗したら読み直してやり直す |
| AP-06 食品を足す | AP-05 と同じく、読んで → 足して合計を計算し直し → `version` 条件つきで更新 | 同じ `item_id` の二重追加はコードで弾く |
| AP-08 全削除 | `Query`（`PK = USER#<sub>`）→ `BatchWriteItem` で削除（25件ずつ） | アカウント削除（F-002） |

食事の合計の計算と、ドメインのルール（DM-01〜DM-09）の検証は、保存・更新の前にバックエンドのコードで行う。DynamoDB 側では検証しない。

## 3. ID（DAT-06）

- `meal_id` と `item_id` は **UUIDv7**（時刻順に並ぶ UUID）。**アプリ側で作る**
- アプリが作ることで、通信が切れて再送しても同じ ID になり、`attribute_not_exists` の条件で二重保存を防げる（オフライン対応 REQ-17 にも有利）
- `user_id` は Cognito の `sub`。アプリから送られた値は使わず、バックエンドが認証情報から取る

## 4. 日時（DAT-07）

| 属性 | 形式 | 例 |
|---|---|---|
| `eaten_at` | 日本時間の ISO 8601（秒まで） | `2026-11-13T12:30:05+09:00` |
| `record_date` | `YYYY-MM-DD` | `2026-11-13`（`eaten_at` − 4時間の日付） |
| `created_at` / `updated_at` | UTC の ISO 8601 | `2026-11-13T03:30:07Z` |

タイムゾーンは日本時間に固定（Q-33）。海外対応（REQ-21）をするときは、`eaten_at` にその時のオフセットを持たせる形で広げられる。

## 5. 削除と履歴（DAT-08）

- 削除は物理削除。論理削除フラグや更新履歴は持たない（保存後の修正をしないため、Q-31）
- バックアップは DynamoDB のポイントインタイムリカバリ（PITR）で考える（DAT-13、INF-08 で決める）

## 6. 精度（DAT-03）

- 保存する値: kcal・g とも小数第1位（四捨五入）。元の値（reference）は取得・推定したままの値（OCR は表示どおり）
- 表示: kcal は整数、g は小数第1位（画面設計で確定）
- null は「不明」。0 とは区別する
