"""Schemas Pydantic da API."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class StatementUploadResult(BaseModel):
    statement_kind: str
    account_id: int
    account_name: str
    total_rows: int
    imported: int
    skipped_duplicates: int


class RuleCreate(BaseModel):
    pattern: str
    category_id: int
    priority: int = 100


class RuleOut(BaseModel):
    id: int
    pattern: str
    category_id: int
    category_name: str
    priority: int
    source: str


class RuleRunOut(BaseModel):
    scanned: int
    categorized: int


class LlmSuggestionOut(BaseModel):
    description: str
    category_id: int | None
    category_name: str | None
    regex: str | None


class LlmRunOut(BaseModel):
    descriptions_sent: int
    rules_created: int
    scanned: int
    categorized: int
    suggestions: list[LlmSuggestionOut]


class CategoryOut(BaseModel):
    id: int
    name: str
    parent_id: int | None
    is_fixed: bool
    kind: str


class TransactionOut(BaseModel):
    id: int
    occurred_at: date
    description: str
    operation: str | None
    amount: Decimal
    category_id: int | None
    category_name: str | None
    account_name: str


class TransactionPageOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[TransactionOut]


class CategorizeIn(BaseModel):
    category_id: int
    keyword: str | None = None


class CategorizeOut(BaseModel):
    transaction_id: int
    category_id: int
    category_name: str
    rule_created: bool
    rule_pattern: str | None
    additional_categorized: int


class MonthlyFixedVariableOut(BaseModel):
    month: str
    fixed: Decimal
    variable: Decimal


class CohortCellOut(BaseModel):
    month: str
    category: str
    total: Decimal


class CategoryShareItemOut(BaseModel):
    category: str
    total: Decimal
    percentage: float


class CategoryShareOut(BaseModel):
    month: str | None
    total: Decimal
    items: list[CategoryShareItemOut]
