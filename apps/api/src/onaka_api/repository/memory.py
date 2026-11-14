"""メモリ上の保存先（テスト・ローカルの動作確認用）。"""

from __future__ import annotations

import copy

from onaka_api.domain import VersionConflict
from onaka_api.repository import JsonDict, MealAlreadyExists

_Key = tuple[str, str, str]  # (user_id, record_date, meal_id)


class InMemoryMealRepository:
    def __init__(self) -> None:
        self._meals: dict[_Key, JsonDict] = {}

    @staticmethod
    def _key(meal: JsonDict) -> _Key:
        return meal["user_id"], meal["record_date"], meal["meal_id"]

    def create(self, meal: JsonDict) -> None:
        # DynamoDB と同じく、同じ利用者・同じ記録日の中で食事 ID の重複を調べる（ID はアプリが UUIDv7 で作るため、
        # 記録日をまたいだ重複は再送では起きない）
        if self._key(meal) in self._meals:
            raise MealAlreadyExists(meal["meal_id"])
        self._meals[self._key(meal)] = copy.deepcopy(meal)

    def get(self, user_id: str, record_date: str, meal_id: str) -> JsonDict | None:
        meal = self._meals.get((user_id, record_date, meal_id))
        return copy.deepcopy(meal) if meal else None

    def list_day(self, user_id: str, record_date: str) -> list[JsonDict]:
        meals = [m for (u, d, _), m in self._meals.items() if u == user_id and d == record_date]
        return [copy.deepcopy(m) for m in sorted(meals, key=lambda m: (m["eaten_at"], m["meal_id"]))]

    def replace(self, meal: JsonDict, *, expected_version: int) -> None:
        current = self._meals.get(self._key(meal))
        if current is None or current["version"] != expected_version:
            raise VersionConflict(f"expected_version {expected_version}")
        self._meals[self._key(meal)] = copy.deepcopy(meal)

    def delete(self, user_id: str, record_date: str, meal_id: str) -> bool:
        return self._meals.pop((user_id, record_date, meal_id), None) is not None
