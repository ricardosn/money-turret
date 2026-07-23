"""Parsing e normalização de extratos CSV do Nubank (Passo 3 do Roadmap)."""

import enum
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import pandas as pd


class StatementKind(enum.Enum):
    CHECKING = "checking"
    CREDIT_CARD = "credit_card"


@dataclass(frozen=True)
class ParsedTransaction:
    occurred_at: date
    description: str
    operation: str | None
    raw_description: str
    amount: Decimal
    external_id: str
    is_internal_transfer: bool


# Prefixos que o Nubank embute na descrição do extrato de conta corrente.
# Ordenados do mais longo para o mais curto para o match ser guloso.
KNOWN_OPERATIONS: tuple[str, ...] = (
    "Transferência recebida pelo Pix",
    "Transferência enviada pelo Pix",
    "Reembolso recebido pelo Pix",
    "Compra no débito via NuPay",
    "Pagamento de boleto efetuado",
    "Transferência recebida",
    "Transferência enviada",
    "Pagamento da fatura",
    "Pagamento de fatura",
    "Compra no débito",
    "Depósito recebido",
    "Aplicação RDB",
    "Resgate RDB",
)

_CHECKING_COLUMNS = {"data", "valor", "identificador", "descrição"}
_CARD_COLUMNS = {"date", "title", "amount"}

# Operações que são sempre movimentação interna (entre contas/produtos do
# próprio titular), nunca despesa ou receita real: pagamento da própria
# fatura, aplicação/resgate em renda fixa do próprio Nubank.
#
# Note: "Pagamento de boleto efetuado" NÃO entra aqui — é o prefixo genérico
# do Nubank para qualquer boleto pago (condomínio, contas de consumo etc.),
# a maioria despesas reais. Só a fatura do próprio cartão é interna.
ALWAYS_INTERNAL_OPERATIONS: tuple[str, ...] = (
    "Pagamento da fatura",
    "Pagamento de fatura",
    "Pagamento recebido",
    "Aplicação RDB",
    "Resgate RDB",
)

# Operações de transferência: só são internas quando a contraparte é uma
# corretora/instituição de investimento conhecida (aporte ou resgate).
_TRANSFER_OPERATIONS: frozenset[str] = frozenset(
    {
        "Transferência enviada",
        "Transferência enviada pelo Pix",
        "Transferência recebida",
        "Transferência recebida pelo Pix",
    }
)

# Substrings (case-insensitive) de contrapartes conhecidas de corretoras e
# plataformas de investimento — transferências para/de essas entidades são
# aportes ou resgates do próprio titular, não despesas ou receitas reais.
INTERNAL_TRANSFER_COUNTERPARTIES: tuple[str, ...] = (
    "nuinvest",
    "nu invest",
    "xp investimentos",
    "rico investimentos",
    "clear corretora",
    "easynvest",
    "modalmais",
    "binance",
    "corretora",
    "investimentos",
)


def is_internal_transfer(operation: str | None, raw_description: str) -> bool:
    """Identifica movimentações entre contas do próprio titular.

    Cobre pagamento da própria fatura de cartão, aplicações/resgates em
    RDB e transferências (Pix ou TED) para corretoras/plataformas de
    investimento conhecidas — nenhuma delas é despesa ou receita real e
    incluí-las distorceria a taxa de poupança mensal.
    """
    if operation in ALWAYS_INTERNAL_OPERATIONS:
        return True
    if operation in _TRANSFER_OPERATIONS:
        lowered = raw_description.lower()
        return any(kw in lowered for kw in INTERNAL_TRANSFER_COUNTERPARTIES)
    return False


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _split_operation(raw: str) -> tuple[str | None, str]:
    """Separa o prefixo de operação da contraparte/estabelecimento.

    Ex: "Transferência enviada pelo Pix - FULANO - •••.123... - BANCO ..."
    vira ("Transferência enviada pelo Pix", "FULANO").
    """
    parts = [p.strip() for p in raw.split(" - ")]
    if parts[0] in KNOWN_OPERATIONS:
        operation = parts[0]
        description = parts[1] if len(parts) > 1 and parts[1] else operation
        return operation, description
    return None, raw


def detect_kind(df: pd.DataFrame) -> StatementKind:
    columns = {str(c).strip().lower() for c in df.columns}
    if _CHECKING_COLUMNS <= columns:
        return StatementKind.CHECKING
    if _CARD_COLUMNS <= columns:
        return StatementKind.CREDIT_CARD
    raise ValueError(
        "Formato de CSV não reconhecido. Esperado extrato de conta "
        "(Data, Valor, Identificador, Descrição) ou fatura de cartão "
        "(date, title, amount)."
    )


def _parse_checking(df: pd.DataFrame) -> list[ParsedTransaction]:
    df = df.rename(columns={c: str(c).strip().lower() for c in df.columns})
    df = df.dropna(subset=["data", "valor", "descrição"])

    transactions: list[ParsedTransaction] = []
    for row in df.itertuples(index=False):
        raw_description = _clean(str(getattr(row, "descrição")))
        operation, description = _split_operation(raw_description)
        transactions.append(
            ParsedTransaction(
                occurred_at=pd.to_datetime(row.data, dayfirst=True).date(),
                description=description,
                operation=operation,
                raw_description=raw_description,
                amount=Decimal(str(row.valor)).quantize(Decimal("0.01")),
                external_id=_clean(str(row.identificador)),
                is_internal_transfer=is_internal_transfer(operation, raw_description),
            )
        )
    return transactions


def _parse_card(df: pd.DataFrame) -> list[ParsedTransaction]:
    df = df.rename(columns={c: str(c).strip().lower() for c in df.columns})
    df = df.dropna(subset=["date", "title", "amount"])

    transactions: list[ParsedTransaction] = []
    seen: dict[str, int] = {}
    for row in df.itertuples(index=False):
        raw_description = _clean(str(row.title))
        occurred_at = pd.to_datetime(row.date).date()
        # Na fatura, valor positivo é despesa; invertemos para manter a
        # convenção do banco (negativo = saída).
        amount = (-Decimal(str(row.amount))).quantize(Decimal("0.01"))
        operation = (
            "Pagamento recebido" if raw_description == "Pagamento recebido" else None
        )

        # A fatura não traz identificador; geramos um hash determinístico
        # com contador de ocorrência para tolerar compras idênticas no dia
        # sem quebrar a deduplicação entre re-uploads do mesmo arquivo.
        base_key = f"card|{occurred_at.isoformat()}|{raw_description}|{amount}"
        seen[base_key] = seen.get(base_key, 0) + 1
        external_id = hashlib.sha1(
            f"{base_key}|{seen[base_key]}".encode()
        ).hexdigest()

        transactions.append(
            ParsedTransaction(
                occurred_at=occurred_at,
                description=raw_description,
                operation=operation,
                raw_description=raw_description,
                amount=amount,
                external_id=external_id,
                is_internal_transfer=is_internal_transfer(operation, raw_description),
            )
        )
    return transactions


def parse_statement(
    content: bytes,
) -> tuple[StatementKind, list[ParsedTransaction]]:
    """Lê o CSV, detecta o formato e devolve transações normalizadas."""
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise ValueError(f"Arquivo CSV inválido: {exc}") from exc

    kind = detect_kind(df)
    if kind is StatementKind.CHECKING:
        return kind, _parse_checking(df)
    return kind, _parse_card(df)
