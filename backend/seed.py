"""Popula a tabela de categorias com a árvore da Seção 4 do CLAUDE.md.

Execução (dentro do container backend):
    python seed.py

O script é idempotente: categorias já existentes (mesmo nome + mesmo pai)
não são duplicadas em execuções repetidas.
"""

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Account,
    AccountType,
    Category,
    CategoryKind,
    CategoryRule,
    RuleSource,
)

DEFAULT_ACCOUNT_NAME = "Nubank Conta Corrente (30179019)"


@dataclass(frozen=True)
class CategoryNode:
    name: str
    kind: CategoryKind = CategoryKind.EXPENSE
    description: str | None = None
    is_fixed: bool = False
    children: tuple["CategoryNode", ...] = field(default=())


SEED_TREE: tuple[CategoryNode, ...] = (
    # ── Despesas Variáveis & Estilo de Vida ─────────────────────────────
    CategoryNode(
        name="Alimentação",
        children=(
            CategoryNode(name="Supermercado"),
            CategoryNode(
                name="Restaurantes",
                children=(
                    CategoryNode(name="Churrascarias"),
                    CategoryNode(name="Cantinas Italianas"),
                    CategoryNode(name="Fast-food"),
                ),
            ),
        ),
    ),
    CategoryNode(
        name="Lazer & Hobbies",
        children=(
            CategoryNode(
                name="Boardgames",
                description="Jogos de tabuleiro: compras de manuais e expansões.",
            ),
            CategoryNode(
                name="Outdoor / Trilhas",
                description=(
                    "Equipamentos de alta performance, custos de deslocamento "
                    "e passaportes de trilhas."
                ),
            ),
        ),
    ),
    CategoryNode(
        name="Transporte",
        description="Foco em acompanhamento de custos de performance do carro.",
        children=(
            CategoryNode(name="Combustível"),
            CategoryNode(name="Pedágios"),
            CategoryNode(name="Manutenção Veicular"),
        ),
    ),
    # ── Custos Fixos ────────────────────────────────────────────────────
    CategoryNode(
        name="Custos Fixos",
        is_fixed=True,
        description="Despesas recorrentes de valor previsível.",
        children=(
            CategoryNode(name="Moradia", is_fixed=True),
            CategoryNode(name="Energia / Água / Gás", is_fixed=True),
            CategoryNode(name="Internet / Telefone", is_fixed=True),
            CategoryNode(name="Assinaturas", is_fixed=True),
            CategoryNode(name="Seguros", is_fixed=True),
        ),
    ),
    # ── Planejamento e Metas (Projetos Futuros) ─────────────────────────
    CategoryNode(
        name="Projetos Futuros",
        kind=CategoryKind.GOAL,
        description="Reservas e aportes atrelados a objetivos de curto/médio prazo.",
        children=(
            CategoryNode(
                name="Viagens Internacionais",
                kind=CategoryKind.GOAL,
                description="Roteiros complexos (ex: Ásia).",
            ),
            CategoryNode(
                name="Troca de Veículo",
                kind=CategoryKind.GOAL,
                description="Análise de liquidez e aporte.",
            ),
            CategoryNode(
                name="Viagens de Fim de Semana",
                kind=CategoryKind.GOAL,
                description="Viagens curtas: eventos esportivos e competições.",
            ),
        ),
    ),
)


# Regras regex iniciais: padrão -> nome da categoria (case-insensitive).
SEED_RULES: tuple[tuple[str, str], ...] = (
    (r"ifood|i\s*food", "Restaurantes"),
    (r"mc\s?donald|burger king|bk\b|subway|habib", "Fast-food"),
    (r"supermercad|mercado|atacad|carrefour|assai|zaffari|big\b", "Supermercado"),
    (r"posto|ipiranga|shell|petrobras|br mania|combustive", "Combustível"),
    (r"pedagio|conectcar|veloe|sem parar", "Pedágios"),
    (r"ludopedia|boardgame|galapagos|devir|jogos de tabuleiro", "Boardgames"),
    (r"decathlon|trilha|camping|montanha", "Outdoor / Trilhas"),
    (r"netflix|spotify|disney|hbo|prime video|youtube premium", "Assinaturas"),
    (r"vivo|claro|tim\b|oi\b|net\b", "Internet / Telefone"),
    (r"aluguel|condominio|imobiliaria", "Moradia"),
    (r"cpfl|enel|light|energia|sanepar|sabesp|comgas", "Energia / Água / Gás"),
)


def _upsert_node(db: Session, node: CategoryNode, parent: Category | None) -> int:
    """Insere o nó caso não exista e desce recursivamente nos filhos."""
    parent_id = parent.id if parent is not None else None
    category = (
        db.query(Category)
        .filter(Category.name == node.name, Category.parent_id == parent_id)
        .one_or_none()
    )

    created = 0
    if category is None:
        category = Category(
            name=node.name,
            kind=node.kind,
            description=node.description,
            is_fixed=node.is_fixed,
            parent_id=parent_id,
        )
        db.add(category)
        db.flush()  # garante o id para os filhos
        created = 1

    for child in node.children:
        created += _upsert_node(db, child, category)
    return created


def _upsert_default_account(db: Session) -> bool:
    """Cria a conta corrente Nubank dos extratos, caso ainda não exista."""
    exists = (
        db.query(Account).filter(Account.name == DEFAULT_ACCOUNT_NAME).one_or_none()
    )
    if exists is not None:
        return False
    db.add(
        Account(
            name=DEFAULT_ACCOUNT_NAME,
            institution="Nubank",
            type=AccountType.CHECKING,
        )
    )
    return True


def _upsert_rules(db: Session) -> int:
    created = 0
    for pattern, category_name in SEED_RULES:
        category = (
            db.query(Category).filter(Category.name == category_name).one_or_none()
        )
        if category is None:
            continue
        exists = (
            db.query(CategoryRule)
            .filter(CategoryRule.pattern == pattern)
            .one_or_none()
        )
        if exists is None:
            db.add(
                CategoryRule(
                    pattern=pattern,
                    category_id=category.id,
                    source=RuleSource.SEED,
                )
            )
            created += 1
    return created


def seed() -> None:
    from app.main import _ensure_schema

    _ensure_schema()
    db = SessionLocal()
    try:
        created = sum(_upsert_node(db, root, None) for root in SEED_TREE)
        account_created = _upsert_default_account(db)
        rules_created = _upsert_rules(db)
        db.commit()
        total = db.query(Category).count()
        print(f"Seed concluído: {created} categoria(s) criada(s), {total} no total.")
        print(f"Regras de categorização criadas: {rules_created}")
        if account_created:
            print(f"Conta criada: {DEFAULT_ACCOUNT_NAME}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
