"""DynamoDB の保存先（docs/02_design/data-model.md）。PK = USER#<sub>、SK = MEAL#記録日#時刻#食事ID。

boto3 の低レベルのクライアント（client("dynamodb")）を使い、型の変換（TypeSerializer）をこのモジュールで行う。
数値は Decimal で保存し、読むときに int / float に戻す。
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError

from onaka_api.domain import VersionConflict
from onaka_api.repository import JsonDict, MealAlreadyExists

_ser = TypeSerializer()
_de = TypeDeserializer()
_KEYS = ("PK", "SK", "entity")


def create_table(client: Any, table_name: str) -> None:
    """テーブルを作る（DynamoDB Local・テスト用。AWS 上は SAM のテンプレートで作る）。"""
    client.create_table(
        TableName=table_name,
        KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    client.get_waiter("table_exists").wait(TableName=table_name)


def _pk(user_id: str) -> str:
    return f"USER#{user_id}"


def sort_key(meal: JsonDict) -> str:
    """MEAL#記録日#時刻（日本時間の HH:MM:SS）#食事ID"""
    time = datetime.fromisoformat(meal["eaten_at"]).strftime("%H:%M:%S")
    return f"MEAL#{meal['record_date']}#{time}#{meal['meal_id']}"


def _to_dynamo(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: _to_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_dynamo(v) for v in value]
    return value


def _from_dynamo(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() and "." not in str(value) else float(value)
    if isinstance(value, dict):
        return {k: _from_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_dynamo(v) for v in value]
    return value


def _item(meal: JsonDict) -> dict[str, Any]:
    attrs = {"PK": _pk(meal["user_id"]), "SK": sort_key(meal), "entity": "meal", **_to_dynamo(meal)}
    return {k: _ser.serialize(v) for k, v in attrs.items()}


def _meal(item: dict[str, Any]) -> JsonDict:
    plain = {k: _de.deserialize(v) for k, v in item.items() if k not in _KEYS}
    return _from_dynamo(plain)  # type: ignore[no-any-return]


def _is_conditional_failure(e: ClientError) -> bool:
    return e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"  # type: ignore[no-any-return]


class DynamoMealRepository:
    def __init__(self, client: Any, table_name: str) -> None:
        self._client = client
        self._table = table_name

    def _query_day(self, user_id: str, record_date: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        kwargs: dict[str, Any] = {
            "TableName": self._table,
            "KeyConditionExpression": "PK = :pk AND begins_with(SK, :prefix)",
            "ExpressionAttributeValues": {":pk": {"S": _pk(user_id)}, ":prefix": {"S": f"MEAL#{record_date}#"}},
        }
        while True:
            res = self._client.query(**kwargs)
            items += res.get("Items", [])
            if "LastEvaluatedKey" not in res:
                return items
            kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]

    def _find(self, user_id: str, record_date: str, meal_id: str) -> dict[str, Any] | None:
        for item in self._query_day(user_id, record_date):
            if item["meal_id"]["S"] == meal_id:
                return item
        return None

    def create(self, meal: JsonDict) -> None:
        if self._find(meal["user_id"], meal["record_date"], meal["meal_id"]) is not None:
            raise MealAlreadyExists(meal["meal_id"])
        try:
            self._client.put_item(
                TableName=self._table, Item=_item(meal), ConditionExpression="attribute_not_exists(PK)"
            )
        except ClientError as e:
            if _is_conditional_failure(e):
                raise MealAlreadyExists(meal["meal_id"]) from e
            raise

    def get(self, user_id: str, record_date: str, meal_id: str) -> JsonDict | None:
        item = self._find(user_id, record_date, meal_id)
        return _meal(item) if item else None

    def list_day(self, user_id: str, record_date: str) -> list[JsonDict]:
        # SK は 記録日#時刻#ID の順なので、Query の結果はそのまま時刻の順。eaten_at でも並べ直しておく
        meals = [_meal(i) for i in self._query_day(user_id, record_date)]
        return sorted(meals, key=lambda m: (m["eaten_at"], m["meal_id"]))

    def replace(self, meal: JsonDict, *, expected_version: int) -> None:
        try:
            self._client.put_item(
                TableName=self._table,
                Item=_item(meal),
                ConditionExpression="attribute_exists(PK) AND version = :v",
                ExpressionAttributeValues={":v": {"N": str(expected_version)}},
            )
        except ClientError as e:
            if _is_conditional_failure(e):
                raise VersionConflict(f"expected_version {expected_version}") from e
            raise

    def delete(self, user_id: str, record_date: str, meal_id: str) -> bool:
        item = self._find(user_id, record_date, meal_id)
        if item is None:
            return False
        try:
            self._client.delete_item(
                TableName=self._table,
                Key={"PK": item["PK"], "SK": item["SK"]},
                ConditionExpression="attribute_exists(PK)",
            )
        except ClientError as e:
            if _is_conditional_failure(e):
                return False
            raise
        return True
