"""ドメインのエラー。API ではエラーコード（docs/02_design/api.md §5）に対応づける。"""

from __future__ import annotations


class DomainError(Exception):
    """ドメインのエラーの基底。`code` は API のエラーコード、`rule` は違反したルールの ID（あれば）。"""

    code = "validation_error"

    def __init__(self, message: str, *, rule: str | None = None) -> None:
        super().__init__(message)
        self.rule = rule


class RuleViolation(DomainError):
    """ドメインのルール（DM-01〜09）に違反した入力。API では 400 validation_error。"""


class VersionConflict(DomainError):
    """expected_version が今の版と違う。API では 409 version_conflict。"""

    code = "version_conflict"


class ItemAlreadyExists(DomainError):
    """同じ item_id の食品がすでにある（再送）。API では 409 item_already_exists。"""

    code = "item_already_exists"


class ItemNotFound(DomainError):
    """消そうとした item_id の食品がない。API では 404 not_found。"""

    code = "not_found"
