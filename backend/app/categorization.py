"""Motor de regras regex para categorização de transações (Passo 4)."""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CategoryRule, Transaction

# Movimentações internas (não são despesa nem receita real).
INTERNAL_OPERATIONS: tuple[str, ...] = (
    "Aplicação RDB",
    "Resgate RDB",
    "Pagamento de fatura",
    "Pagamento da fatura",
    "Pagamento recebido",
)


@dataclass(frozen=True)
class RuleRunResult:
    scanned: int
    categorized: int


def _load_compiled_rules(db: Session) -> list[tuple[re.Pattern[str], int]]:
    rules = db.scalars(
        select(CategoryRule).order_by(CategoryRule.priority, CategoryRule.id)
    ).all()
    compiled: list[tuple[re.Pattern[str], int]] = []
    for rule in rules:
        try:
            compiled.append((re.compile(rule.pattern, re.IGNORECASE), rule.category_id))
        except re.error:
            continue  # regra inválida não pode derrubar o motor
    return compiled


def apply_rules(db: Session, recategorize: bool = False) -> RuleRunResult:
    """Aplica as regras às transações sem categoria (ou a todas, se pedido).

    A primeira regra que casar (por prioridade) define a categoria.
    """
    compiled = _load_compiled_rules(db)

    query = select(Transaction)
    if not recategorize:
        query = query.where(Transaction.category_id.is_(None))
    transactions = db.scalars(query).all()

    categorized = 0
    for transaction in transactions:
        for pattern, category_id in compiled:
            if pattern.search(transaction.description):
                if transaction.category_id != category_id:
                    transaction.category_id = category_id
                    categorized += 1
                break

    db.commit()
    return RuleRunResult(scanned=len(transactions), categorized=categorized)


def uncategorized_descriptions(db: Session, limit: int = 50) -> list[str]:
    """Descrições distintas ainda sem categoria (excluindo internas)."""
    rows = db.scalars(
        select(Transaction.description)
        .where(
            Transaction.category_id.is_(None),
            Transaction.operation.notin_(INTERNAL_OPERATIONS)
            | Transaction.operation.is_(None),
        )
        .distinct()
        .limit(limit)
    ).all()
    return list(rows)
