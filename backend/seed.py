"""Popula a tabela de categorias com a árvore da Seção 4 do CLAUDE.md.

Execução (dentro do container backend):
    python seed.py

O script é idempotente: categorias já existentes (mesmo nome + mesmo pai)
não são duplicadas em execuções repetidas.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Account,
    AccountType,
    Category,
    CategoryKind,
    CategoryRule,
    Project,
    ProjectProvision,
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


@dataclass(frozen=True)
class ProvisionSeed:
    item: str
    estimated_value: Decimal
    expected_month: date
    is_paid: bool = False


@dataclass(frozen=True)
class ProjectSeed:
    title: str
    target_date: date
    total_budget: Decimal
    provisions: tuple[ProvisionSeed, ...]


# Dois projetos de exemplo para validar o módulo "Simulador de Projetos":
# um roteiro internacional em andamento e um fim de semana já provisionado.
PROJECT_SEEDS: tuple[ProjectSeed, ...] = (
    ProjectSeed(
        title="Roteiro Ásia (15 a 20 dias)",
        target_date=date(2027, 3, 5),
        total_budget=Decimal("22000.00"),
        provisions=(
            ProvisionSeed(
                "Passagens aéreas antecipadas",
                Decimal("7800.00"),
                date(2026, 9, 1),
                is_paid=True,
            ),
            ProvisionSeed(
                "Compra de moeda (Baht/Rupia)",
                Decimal("3200.00"),
                date(2027, 1, 1),
            ),
            ProvisionSeed(
                "Seguro viagem",
                Decimal("850.00"),
                date(2026, 12, 1),
                is_paid=True,
            ),
            ProvisionSeed(
                "Reserva para guias de trilhas e passeios em templos "
                "(Indonésia/Tailândia)",
                Decimal("3600.00"),
                date(2027, 2, 1),
            ),
        ),
    ),
    ProjectSeed(
        title="Fim de semana no litoral (Junho 2026)",
        target_date=date(2026, 6, 27),
        total_budget=Decimal("1400.00"),
        provisions=(
            ProvisionSeed(
                "Hospedagem em Caraguatatuba",
                Decimal("650.00"),
                date(2026, 6, 1),
                is_paid=True,
            ),
            ProvisionSeed(
                "Combustível e pedágio (ida e volta a Caraguatatuba)",
                Decimal("220.00"),
                date(2026, 6, 1),
                is_paid=True,
            ),
            ProvisionSeed(
                "Inscrição e logística — prova de natação em águas abertas",
                Decimal("380.00"),
                date(2026, 5, 1),
                is_paid=True,
            ),
        ),
    ),
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


def _upsert_projects(db: Session) -> tuple[int, int]:
    """Cria os projetos e provisionamentos de exemplo, se ainda não existirem.

    Idempotente: casa por título do projeto e por item dentro do projeto.
    """
    projects_created = 0
    provisions_created = 0
    for project_seed in PROJECT_SEEDS:
        project = (
            db.query(Project)
            .filter(Project.title == project_seed.title)
            .one_or_none()
        )
        if project is None:
            project = Project(
                title=project_seed.title,
                target_date=project_seed.target_date,
                total_budget=project_seed.total_budget,
            )
            db.add(project)
            db.flush()  # garante o id para os provisionamentos
            projects_created += 1

        for provision_seed in project_seed.provisions:
            exists = (
                db.query(ProjectProvision)
                .filter(
                    ProjectProvision.project_id == project.id,
                    ProjectProvision.item == provision_seed.item,
                )
                .one_or_none()
            )
            if exists is None:
                db.add(
                    ProjectProvision(
                        project_id=project.id,
                        item=provision_seed.item,
                        estimated_value=provision_seed.estimated_value,
                        expected_month=provision_seed.expected_month,
                        is_paid=provision_seed.is_paid,
                    )
                )
                provisions_created += 1

    return projects_created, provisions_created


def seed() -> None:
    from app.main import _ensure_schema

    _ensure_schema()
    db = SessionLocal()
    try:
        created = sum(_upsert_node(db, root, None) for root in SEED_TREE)
        account_created = _upsert_default_account(db)
        rules_created = _upsert_rules(db)
        projects_created, provisions_created = _upsert_projects(db)
        db.commit()
        total = db.query(Category).count()
        print(f"Seed concluído: {created} categoria(s) criada(s), {total} no total.")
        print(f"Regras de categorização criadas: {rules_created}")
        if account_created:
            print(f"Conta criada: {DEFAULT_ACCOUNT_NAME}")
        print(
            f"Projetos criados: {projects_created} | "
            f"Provisionamentos criados: {provisions_created}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed()
