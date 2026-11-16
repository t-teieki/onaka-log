# F-011 バーコード照合（候補の作り方）

> ステータス: Draft
> 最終更新: 2026-11-14
> 関連: [ADR-0009](../../adr/0009-barcode-adoption-and-net-content.md), [api.md](../../02_design/api.md) §3〜4, [domain-model.md](../../02_design/domain-model.md) §2, PoC-1（[poc1-barcode.md](../../../poc/reports/poc1-barcode.md)）
> API: `GET /v1/products/{product_code}` → `ProductLookupResponse`

バックエンドが Open Food Facts（以下 OFF）の商品の応答から、保存用の食品の候補（`FoodItemDraft`）を作る規則。画面の振る舞いは [screens](../../02_design/screens/README.md) を参照。

## 要件

| ID | 要件 |
|---|---|
| F-011-01 | OFF の応答で商品が見つかり（`status` が 1 で `product` がある）、100g 当たりのエネルギーが分かるときは `status = found` と候補1件を返す。それ以外（商品がない、エネルギーが分からない）は `status = not_found`、`item = null` |
| F-011-02 | エネルギーは `energy-kcal_100g` を使う。なければ `energy-kj_100g`（それもなければ `energy_100g`、OFF では kJ）を 4.184 で割って kcal にし、小数第1位で四捨五入する |
| F-011-03 | たんぱく質・脂質・炭水化物は `proteins_100g`・`fat_100g`・`carbohydrates_100g`。ないものは null（不明） |
| F-011-04 | 食品名は `product_name_ja`、なければ `product_name`、どちらもなければ「名称不明の商品」 |
| F-011-05 | 内容量は次の順で決める（ADR-0009）。① `product_quantity`（単位は `product_quantity_unit`）→ `known` ② `quantity` の文字列（例「78g」「1.5L」）を読めたら → `known` ③ `serving_quantity`（単位は `serving_size` の文字列から。読めなければ基準の単位）→ `assumed_from_serving` ④ どれもない → `unknown`（量・単位は null）。kg・L などは g・ml に直す |
| F-011-06 | 基準は、内容量の単位が ml なら `per_100ml`、それ以外は `per_100g`（OFF は飲み物も 100g 当たりで持つことが多いため、ml の商品は 100g ≒ 100ml とみなす）。基準量は 100、単位は g / ml、表記（label）は null |
| F-011-07 | 出どころは `method = barcode`、`provider = open_food_facts`、`product_code` は照合した番号。`estimation`・`confidence`・列の番号と見出しは null。`estimate_detail` は null |
| F-011-08 | 分量の既定（`default_portion`）は `whole`（基準が per_piece になることはない） |
| F-011-09 | 番号が 8〜14 桁の数字でなければ 400 validation_error（OpenAPI のパスの形） |
| F-011-10 | OFF に届かない・タイムアウト・5xx は 502 upstream_unavailable。OFF の 404 は `not_found`（エラーにしない） |

F-011-09・10 は API の層（ルート・HTTP クライアント）で実装する。

## Open Food Facts の呼び出し（API の層）

| ID | 要件 |
|---|---|
| F-011-11 | `GET {OFF の URL}/api/v2/product/{番号}.json` を、`User-Agent: onaka-log/<版>`（個人情報を含めない）で呼ぶ。タイムアウトは設定から読む（既定 5秒） |
| F-011-12 | 200 なら本文を F-011-01〜08 で変換する。404 は `not_found`（F-011-10） |

## アプリ側: 読み取りと照合（2026-11-16、画面設計 3-3・4・4-1）

| ID | 要件 |
|---|---|
| F-011-13 | 入力方式の選択（ホームの「記録する」、食事の詳細の「食品を追加」）で「バーコード」を選ぶと読み取りの画面を開く。追加モードは記録日と食事 ID を引き継ぐ（F-030-08） |
| F-011-14 | カメラの許可がなければ、理由（「バーコードを読み取るためにカメラを使います」）と「カメラを許可する」（もう聞けないときは「設定を開く」）、「手入力する」を出す |
| F-011-15 | カメラの映像で JAN（EAN-13・EAN-8・UPC-A・UPC-E）を自動で読み、照合 API（`GET /v1/products/{番号}`）を呼ぶ。照合中は「照合中…」を出し、続けて読んだ番号では呼ばない |
| F-011-16 | `found` なら確認・修正の画面（F-020）に候補を渡す |
| F-011-17 | `not_found` なら「商品が見つかりません」「栄養成分表示を撮ると記録できます」と、「栄養成分表示を撮る」（撮影の画面へ、F-012-15。2026-11-16 に OCR を作るまでの「準備中」をやめた）・「手入力する」・「入力方法の選択に戻る」を出す |
| F-011-18 | 照合に失敗したら（502・500 など）「うまくいきませんでした」と「もう一度」（同じ番号で照合し直す）・「入力方法の選択に戻る」。429 なら「少し時間をおいてください」と「閉じる」。閉じたら読み取りを再開する |
