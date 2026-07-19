"""Motor de regras + categorização via LLM (Passo 4 do Roadmap)."""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.categorization import apply_rules, uncategorized_descriptions
from app.database import get_db
from app.llm import LlmNotConfiguredError, suggest_categories
from app.models import Category, CategoryRule, RuleSource
from app.schemas import LlmRunOut, LlmSuggestionOut, RuleCreate, RuleOut, RuleRunOut

router = APIRouter(prefix="/categorization", tags=["categorization"])


def _rule_out(rule: CategoryRule) -> RuleOut:
    return RuleOut(
        id=rule.id,
        pattern=rule.pattern,
        category_id=rule.category_id,
        category_name=rule.category.name,
        priority=rule.priority,
        source=rule.source.value,
    )


@router.get("/rules", response_model=list[RuleOut])
def list_rules(db: Session = Depends(get_db)) -> list[RuleOut]:
    rules = db.scalars(
        select(CategoryRule).order_by(CategoryRule.priority, CategoryRule.id)
    ).all()
    return [_rule_out(r) for r in rules]


@router.post("/rules", response_model=RuleOut, status_code=201)
def create_rule(payload: RuleCreate, db: Session = Depends(get_db)) -> RuleOut:
    try:
        re.compile(payload.pattern, re.IGNORECASE)
    except re.error as exc:
        raise HTTPException(status_code=422, detail=f"Regex inválido: {exc}") from exc

    if db.get(Category, payload.category_id) is None:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    exists = db.scalar(
        select(CategoryRule).where(CategoryRule.pattern == payload.pattern)
    )
    if exists is not None:
        raise HTTPException(status_code=409, detail="Já existe regra com esse padrão.")

    rule = CategoryRule(
        pattern=payload.pattern,
        category_id=payload.category_id,
        priority=payload.priority,
    )
    db.add(rule)
    db.commit()
    return _rule_out(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)) -> None:
    rule = db.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")
    db.delete(rule)
    db.commit()


@router.post("/run", response_model=RuleRunOut)
def run_rules(
    recategorize: bool = False, db: Session = Depends(get_db)
) -> RuleRunOut:
    """Aplica as regras regex às transações sem categoria."""
    result = apply_rules(db, recategorize=recategorize)
    return RuleRunOut(scanned=result.scanned, categorized=result.categorized)


@router.post("/llm", response_model=LlmRunOut)
def run_llm(limit: int = 50, db: Session = Depends(get_db)) -> LlmRunOut:
    """Pede ao Claude sugestões para descrições ainda sem categoria.

    Sugestões com categoria + regex viram regras (source="llm"); em seguida
    o motor de regras é executado para aplicá-las.
    """
    descriptions = uncategorized_descriptions(db, limit=limit)
    if not descriptions:
        return LlmRunOut(
            descriptions_sent=0, rules_created=0, scanned=0, categorized=0,
            suggestions=[],
        )

    categories = db.scalars(select(Category)).all()
    try:
        suggestions = suggest_categories(descriptions, list(categories))
    except LlmNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    category_names = {c.id: c.name for c in categories}
    rules_created = 0
    # O LLM pode sugerir o mesmo regex para descrições diferentes; com
    # autoflush=False a checagem no banco não vê inserções pendentes,
    # então deduplicamos também dentro do lote.
    pending_patterns: set[str] = set()
    out: list[LlmSuggestionOut] = []
    for s in suggestions:
        out.append(
            LlmSuggestionOut(
                description=s.description,
                category_id=s.category_id,
                category_name=category_names.get(s.category_id or -1),
                regex=s.regex,
            )
        )
        if s.category_id is None or not s.regex:
            continue
        if s.category_id not in category_names:
            continue
        try:
            re.compile(s.regex, re.IGNORECASE)
        except re.error:
            continue
        if s.regex in pending_patterns:
            continue
        exists = db.scalar(
            select(CategoryRule).where(CategoryRule.pattern == s.regex)
        )
        if exists is not None:
            continue
        db.add(
            CategoryRule(
                pattern=s.regex,
                category_id=s.category_id,
                source=RuleSource.LLM,
            )
        )
        pending_patterns.add(s.regex)
        rules_created += 1

    db.commit()
    result = apply_rules(db)
    return LlmRunOut(
        descriptions_sent=len(descriptions),
        rules_created=rules_created,
        scanned=result.scanned,
        categorized=result.categorized,
        suggestions=out,
    )
