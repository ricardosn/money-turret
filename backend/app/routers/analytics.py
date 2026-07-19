"""Agregações para os gráficos do dashboard (Passo 5 do Roadmap).

Todo o cálculo fica no backend; o frontend só renderiza. Despesas são
transações com valor negativo, excluindo movimentações internas (RDB,
pagamento de fatura). Os totais retornam como valores positivos.
"""

from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.categorization import INTERNAL_OPERATIONS
from app.database import get_db
from app.models import Category, Transaction
from app.schemas import (
    CategoryShareItemOut,
    CategoryShareOut,
    CohortCellOut,
    MonthlyFixedVariableOut,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

_month = func.strftime("%Y-%m", Transaction.occurred_at)


def _expense_filters():
    return (
        Transaction.amount < 0,
        Transaction.operation.notin_(INTERNAL_OPERATIONS)
        | Transaction.operation.is_(None),
    )


def _last_months(db: Session, months: int) -> str | None:
    """Menor mês (YYYY-MM) dentro da janela dos últimos N meses com despesa."""
    return db.scalar(
        select(_month)
        .where(*_expense_filters())
        .group_by(_month)
        .order_by(_month.desc())
        .offset(months - 1)
        .limit(1)
    )


@router.get("/fixed-vs-variable", response_model=list[MonthlyFixedVariableOut])
def fixed_vs_variable(
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
) -> list[MonthlyFixedVariableOut]:
    """Total mensal de despesas separado em custo fixo vs variável.

    Fixo = categoria com is_fixed=True. Sem categoria conta como variável.
    """
    fixed_flag = func.coalesce(Category.is_fixed, False)
    query = (
        select(
            _month.label("month"),
            func.sum(case((fixed_flag, -Transaction.amount), else_=0)),
            func.sum(case((~fixed_flag, -Transaction.amount), else_=0)),
        )
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(*_expense_filters())
        .group_by("month")
        .order_by("month")
    )
    cutoff = _last_months(db, months)
    if cutoff is not None:
        query = query.where(_month >= cutoff)

    return [
        MonthlyFixedVariableOut(
            month=month,
            fixed=Decimal(str(fixed or 0)).quantize(Decimal("0.01")),
            variable=Decimal(str(variable or 0)).quantize(Decimal("0.01")),
        )
        for month, fixed, variable in db.execute(query).all()
    ]


def _root_name_resolver(db: Session):
    """Função que resolve o category_id para o nome da raiz da árvore."""
    categories = db.scalars(select(Category)).all()
    parent_of = {c.id: c.parent_id for c in categories}
    name_of = {c.id: c.name for c in categories}

    def root_name(category_id: int | None) -> str:
        if category_id is None:
            return "Sem categoria"
        while parent_of.get(category_id) is not None:
            category_id = parent_of[category_id]
        return name_of[category_id]

    return root_name


@router.get("/category-cohort", response_model=list[CohortCellOut])
def category_cohort(
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
) -> list[CohortCellOut]:
    """Matriz mês × categoria-raiz com o total gasto (coorte de gastos).

    Transações em subcategorias (qualquer profundidade) são agregadas na
    raiz da árvore; sem categoria entram como "Sem categoria".
    """
    root_name = _root_name_resolver(db)

    query = (
        select(
            _month.label("month"),
            Transaction.category_id,
            func.sum(-Transaction.amount),
        )
        .where(*_expense_filters())
        .group_by("month", Transaction.category_id)
    )
    cutoff = _last_months(db, months)
    if cutoff is not None:
        query = query.where(_month >= cutoff)

    totals: dict[tuple[str, str], Decimal] = defaultdict(lambda: Decimal("0"))
    for month, category_id, total in db.execute(query).all():
        totals[(month, root_name(category_id))] += Decimal(str(total or 0))

    return [
        CohortCellOut(
            month=month,
            category=category,
            total=total.quantize(Decimal("0.01")),
        )
        for (month, category), total in sorted(totals.items())
    ]


@router.get("/category-share", response_model=CategoryShareOut)
def category_share(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
) -> CategoryShareOut:
    """Percentual de gastos por categoria-raiz em um mês (para gráfico de pizza).

    Sem `month`, usa o mês mais recente com despesas. Percentuais são
    calculados aqui no backend; o frontend só renderiza.
    """
    if month is None:
        month = db.scalar(
            select(_month)
            .where(*_expense_filters())
            .group_by(_month)
            .order_by(_month.desc())
            .limit(1)
        )
    if month is None:
        return CategoryShareOut(month=None, total=Decimal("0"), items=[])

    root_name = _root_name_resolver(db)
    rows = db.execute(
        select(Transaction.category_id, func.sum(-Transaction.amount))
        .where(*_expense_filters(), _month == month)
        .group_by(Transaction.category_id)
    ).all()

    totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for category_id, total in rows:
        totals[root_name(category_id)] += Decimal(str(total or 0))

    grand_total = sum(totals.values(), Decimal("0"))
    items = [
        CategoryShareItemOut(
            category=category,
            total=total.quantize(Decimal("0.01")),
            percentage=round(float(total / grand_total * 100), 2)
            if grand_total
            else 0.0,
        )
        for category, total in sorted(totals.items(), key=lambda x: -x[1])
    ]
    return CategoryShareOut(
        month=month, total=grand_total.quantize(Decimal("0.01")), items=items
    )
