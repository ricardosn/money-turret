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

from app.database import get_db
from app.models import Category, Transaction
from app.schemas import CohortCellOut, MonthlyFixedVariableOut

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Categorias de "estilo de vida" acompanhadas isoladamente (sem herdar de
# subcategorias) no gráfico de tendência, para detectar inflação do padrão
# de vida (CLAUDE.md §4: hobbies, outdoor, restaurantes/churrascarias).
LIFESTYLE_CATEGORY_NAMES: tuple[str, ...] = (
    "Boardgames",
    "Outdoor / Trilhas",
    "Restaurantes",
    "Churrascarias",
    "Cantinas Italianas",
    "Fast-food",
)

_month = func.strftime("%Y-%m", Transaction.occurred_at)


def _expense_filters():
    return (
        Transaction.amount < 0,
        Transaction.is_internal_transfer.is_(False),
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


def _month_range(start: str, end: str) -> list[str]:
    """Lista contínua de meses ("YYYY-MM") entre start e end, inclusive."""
    start_year, start_month = (int(p) for p in start.split("-"))
    end_year, end_month = (int(p) for p in end.split("-"))
    months: list[str] = []
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        months.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


@router.get("/lifestyle-trend", response_model=list[CohortCellOut])
def lifestyle_trend(
    months: int = Query(default=12, ge=1, le=60),
    db: Session = Depends(get_db),
) -> list[CohortCellOut]:
    """Evolução mensal de categorias de estilo de vida, para identificar
    inflação no padrão de vida (hobbies, outdoor, restaurantes, churrascarias).

    Diferente de /category-cohort, cada categoria é rastreada isoladamente
    (sem herdar gastos de subcategorias) — Restaurantes e Churrascarias, por
    exemplo, aparecem como séries separadas. Meses sem gasto em uma
    categoria entram com total zero para manter a série contínua no
    gráfico de linha.
    """
    categories = db.scalars(
        select(Category).where(Category.name.in_(LIFESTYLE_CATEGORY_NAMES))
    ).all()
    if not categories:
        return []
    name_of = {c.id: c.name for c in categories}
    ordered_names = [n for n in LIFESTYLE_CATEGORY_NAMES if n in name_of.values()]

    query = (
        select(
            _month.label("month"),
            Transaction.category_id,
            func.sum(-Transaction.amount),
        )
        .where(*_expense_filters(), Transaction.category_id.in_(name_of.keys()))
        .group_by("month", Transaction.category_id)
    )
    cutoff = _last_months(db, months)
    if cutoff is not None:
        query = query.where(_month >= cutoff)

    totals: dict[tuple[str, str], Decimal] = defaultdict(lambda: Decimal("0"))
    seen_months: set[str] = set()
    for month, category_id, total in db.execute(query).all():
        totals[(month, name_of[category_id])] += Decimal(str(total or 0))
        seen_months.add(month)

    if not seen_months:
        return []
    all_months = _month_range(min(seen_months), max(seen_months))

    return [
        CohortCellOut(
            month=month,
            category=category_name,
            total=totals.get((month, category_name), Decimal("0")).quantize(
                Decimal("0.01")
            ),
        )
        for month in all_months
        for category_name in ordered_names
    ]
