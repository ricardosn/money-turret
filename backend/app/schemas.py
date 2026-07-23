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
    is_internal_transfer: bool


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


class ProjectCreate(BaseModel):
    title: str
    target_date: date
    total_budget: Decimal


class ProjectUpdate(BaseModel):
    title: str | None = None
    target_date: date | None = None
    total_budget: Decimal | None = None


class ProjectProvisionCreate(BaseModel):
    item: str
    estimated_value: Decimal
    expected_month: date
    is_paid: bool = False


class ProjectProvisionUpdate(BaseModel):
    item: str | None = None
    estimated_value: Decimal | None = None
    expected_month: date | None = None
    is_paid: bool | None = None


class ProjectProvisionOut(BaseModel):
    id: int
    project_id: int
    item: str
    estimated_value: Decimal
    expected_month: str
    is_paid: bool


class ProjectSummaryOut(BaseModel):
    id: int
    title: str
    target_date: date
    total_budget: Decimal
    total_estimated: Decimal
    total_provisioned: Decimal
    progress_percentage: float
    provisions_count: int


class ProjectTimelineEntryOut(BaseModel):
    month: str
    estimated: Decimal
    paid: Decimal
    items: list[ProjectProvisionOut]


class ProjectDetailOut(ProjectSummaryOut):
    provisions: list[ProjectProvisionOut]
    timeline: list[ProjectTimelineEntryOut]
