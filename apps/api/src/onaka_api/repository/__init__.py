"""食事の保存先（DynamoDB・テスト用のメモリ）。どちらも MealRepository の約束を守る。"""

from __future__ import annotations

from typing import Any, Protocol

JsonDict = dict[str, Any]


class MealAlreadyExists(Exception):
    """同じ利用者・同じ meal_id の食事がある（API では 409 meal_already_exists）。"""

    code = "meal_already_exists"


class MealRepository(Protocol):
    def create(self, meal: JsonDict) -> None:
        """新しい食事を保存する。同じ meal_id があれば MealAlreadyExists。"""

    def get(self, user_id: str, record_date: str, meal_id: str) -> JsonDict | None:
        """食事1件。なければ None。"""

    def list_day(self, user_id: str, record_date: str) -> list[JsonDict]:
        """その記録日の食事を eaten_at の順に。"""

    def replace(self, meal: JsonDict, *, expected_version: int) -> None:
        """保存されている食事の version が expected_version のときだけ置き換える。違えば domain.VersionConflict。"""

    def delete(self, user_id: str, record_date: str, meal_id: str) -> bool:
        """食事を削除する。あれば True、なければ False。"""
