"""Listagem e categorização manual de transações."""

import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.categorization import INTERNAL_OPERATIONS, apply_rules
from app.database import get_db
from app.models import Category, CategoryRule, RuleSource, Transaction
from app.schemas import (
    CategorizeIn,
    CategorizeOut,
    CategoryOut,
    TransactionOut,
    TransactionPageOut,
)

router = APIRouter(tags=["transactions"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)) -> list[CategoryOut]:
    categories = db.scalars(select(Category).order_by(Category.name)).all()
    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            parent_id=c.parent_id,
            is_fixed=c.is_fixed,
            kind=c.kind.value,
        )
        for c in categories
    ]


@router.get("/transactions", response_model=TransactionPageOut)
def list_transactions(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    search: str | None = None,
    uncategorized: bool = False,
    exclude_internal: bool = False,
    expenses_only: bool = False,
    incomes_only: bool = False,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> TransactionPageOut:
    """Lista transações mais recentes primeiro, com filtros combináveis.

    `category_id` inclui as subcategorias da categoria informada;
    `search` busca na descrição limpa e na original (case-insensitive);
    `uncategorized=true` retorna apenas transações sem categoria.
    """
    filters = []
    if date_from is not None:
        filters.append(Transaction.occurred_at >= date_from)
    if date_to is not None:
        filters.append(Transaction.occurred_at <= date_to)
    if search:
        pattern = f"%{search}%"
        filters.append(
            Transaction.description.ilike(pattern)
            | Transaction.raw_description.ilike(pattern)
        )
    if expenses_only:
        filters.append(Transaction.amount < 0)
    if incomes_only:
        filters.append(Transaction.amount > 0)
    if exclude_internal:
        filters.append(
            Transaction.operation.notin_(INTERNAL_OPERATIONS)
            | Transaction.operation.is_(None)
        )
    if uncategorized:
        filters.append(Transaction.category_id.is_(None))
    elif category_id is not None:
        if db.get(Category, category_id) is None:
            raise HTTPException(status_code=404, detail="Categoria não encontrada.")
        # Inclui toda a subárvore da categoria filtrada.
        children_of: dict[int | None, list[int]] = {}
        for c in db.scalars(select(Category)).all():
            children_of.setdefault(c.parent_id, []).append(c.id)
        subtree = [category_id]
        queue = [category_id]
        while queue:
            for child in children_of.get(queue.pop(), []):
                subtree.append(child)
                queue.append(child)
        filters.append(Transaction.category_id.in_(subtree))

    total = db.scalar(
        select(func.count()).select_from(Transaction).where(*filters)
    )
    transactions = db.scalars(
        select(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.account))
        .where(*filters)
        .order_by(Transaction.occurred_at.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return TransactionPageOut(
        total=total or 0,
        limit=limit,
        offset=offset,
        items=[
            TransactionOut(
                id=t.id,
                occurred_at=t.occurred_at,
                description=t.description,
                operation=t.operation,
                amount=t.amount,
                category_id=t.category_id,
                category_name=t.category.name if t.category else None,
                account_name=t.account.name,
            )
            for t in transactions
        ],
    )


@router.post("/transactions/{transaction_id}/categorize", response_model=CategorizeOut)
def categorize_transaction(
    transaction_id: int,
    payload: CategorizeIn,
    db: Session = Depends(get_db),
) -> CategorizeOut:
    """Categoriza manualmente uma transação.

    Se `keyword` for informada, cria uma regra (source="manual") com a
    palavra-chave escapada como regex e reaplica o motor — as demais
    transações pendentes que casarem são categorizadas junto.
    """
    transaction = db.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transação não encontrada.")
    category = db.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    transaction.category_id = category.id

    rule_created = False
    pattern: str | None = None
    keyword = (payload.keyword or "").strip()
    if keyword:
        pattern = re.escape(keyword)
        exists = db.scalar(
            select(CategoryRule).where(CategoryRule.pattern == pattern)
        )
        if exists is None:
            db.add(
                CategoryRule(
                    pattern=pattern,
                    category_id=category.id,
                    source=RuleSource.MANUAL,
                )
            )
            rule_created = True

    db.commit()
    additional = apply_rules(db).categorized if rule_created else 0

    return CategorizeOut(
        transaction_id=transaction.id,
        category_id=category.id,
        category_name=category.name,
        rule_created=rule_created,
        rule_pattern=pattern,
        additional_categorized=additional,
    )
