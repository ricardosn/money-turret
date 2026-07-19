"""Modelos SQLAlchemy: Category, Account e Transaction (Passo 2 do Roadmap)."""

import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CategoryKind(enum.Enum):
    """Natureza da categoria: despesa do dia a dia ou meta/projeto futuro."""

    EXPENSE = "expense"
    GOAL = "goal"


class AccountType(enum.Enum):
    CHECKING = "checking"
    CREDIT_CARD = "credit_card"
    SAVINGS = "savings"


class Category(Base):
    """Árvore de categorias (centros de custo, hobbies e projetos)."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    kind: Mapped[CategoryKind] = mapped_column(
        Enum(CategoryKind), default=CategoryKind.EXPENSE
    )
    description: Mapped[str | None] = mapped_column(Text, default=None)
    # Custo fixo (aluguel, assinaturas) vs variável, para o gráfico do passo 5.
    is_fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"), default=None
    )

    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side=[id]
    )
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")

    def __repr__(self) -> str:
        return f"<Category id={self.id} name={self.name!r} kind={self.kind.value}>"


class Account(Base):
    """Conta de origem das transações (ex: conta corrente ou cartão Nubank)."""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    institution: Mapped[str] = mapped_column(String(120), default="Nubank")
    type: Mapped[AccountType] = mapped_column(
        Enum(AccountType), default=AccountType.CHECKING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")

    def __repr__(self) -> str:
        return f"<Account id={self.id} name={self.name!r}>"


class RuleSource(enum.Enum):
    MANUAL = "manual"
    LLM = "llm"
    SEED = "seed"


class CategoryRule(Base):
    """Regra regex que mapeia descrições de transações para uma categoria.

    Regras são aplicadas em ordem de prioridade (menor número = aplicada
    primeiro) sobre a descrição limpa da transação, case-insensitive.
    """

    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(255), unique=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    priority: Mapped[int] = mapped_column(default=100)
    source: Mapped[RuleSource] = mapped_column(
        Enum(RuleSource), default=RuleSource.MANUAL
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    category: Mapped["Category"] = relationship()

    def __repr__(self) -> str:
        return f"<CategoryRule id={self.id} pattern={self.pattern!r}>"


class Transaction(Base):
    """Transação bancária normalizada.

    `raw_description` preserva a string original "suja" do extrato;
    `description` guarda a versão limpa (contraparte/estabelecimento) e
    `operation` o tipo de operação que o Nubank embute como prefixo da
    descrição (ex: "Compra no débito", "Transferência enviada pelo Pix",
    "Aplicação RDB"). Operações como Aplicação/Resgate RDB e Pagamento de
    fatura são movimentações internas e devem ser filtradas das análises
    de despesa. Valores negativos representam saídas; positivos, entradas.
    """

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    occurred_at: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(String(255))
    operation: Mapped[str | None] = mapped_column(
        String(64), index=True, default=None
    )
    raw_description: Mapped[str | None] = mapped_column(Text, default=None)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    external_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, default=None
    )
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id"), index=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    account: Mapped["Account"] = relationship(back_populates="transactions")
    category: Mapped["Category | None"] = relationship(back_populates="transactions")

    def __repr__(self) -> str:
        return (
            f"<Transaction id={self.id} date={self.occurred_at} "
            f"amount={self.amount} desc={self.description!r}>"
        )
