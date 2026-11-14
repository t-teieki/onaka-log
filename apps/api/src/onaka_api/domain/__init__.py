"""ドメイン（外部に依存しない）。"""

from onaka_api.domain.errors import DomainError, ItemAlreadyExists, ItemNotFound, RuleViolation, VersionConflict
from onaka_api.domain.meal import (
    NUTRIENTS,
    add_item,
    build_item,
    create_meal,
    multiplier_for,
    record_date_of,
    remove_item,
    round1,
    totals_of,
    whole_multiplier,
)

__all__ = [
    "NUTRIENTS",
    "DomainError",
    "ItemAlreadyExists",
    "ItemNotFound",
    "RuleViolation",
    "VersionConflict",
    "add_item",
    "build_item",
    "create_meal",
    "multiplier_for",
    "record_date_of",
    "remove_item",
    "round1",
    "totals_of",
    "whole_multiplier",
]
