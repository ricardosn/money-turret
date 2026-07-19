"""Endpoint de upload de extratos (Passo 3 do Roadmap)."""

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.ingestion import StatementKind, parse_statement
from app.models import Account, AccountType, Transaction
from app.schemas import StatementUploadResult

router = APIRouter(prefix="/statements", tags=["statements"])

_DEFAULT_ACCOUNTS: dict[StatementKind, tuple[str, AccountType]] = {
    StatementKind.CHECKING: ("Nubank Conta", AccountType.CHECKING),
    StatementKind.CREDIT_CARD: ("Nubank Cartão", AccountType.CREDIT_CARD),
}


def _resolve_account(
    db: Session, account_id: int | None, kind: StatementKind
) -> Account:
    if account_id is not None:
        account = db.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Conta não encontrada.")
        return account

    name, account_type = _DEFAULT_ACCOUNTS[kind]
    account = db.scalar(select(Account).where(Account.name == name))
    if account is None:
        account = Account(name=name, type=account_type)
        db.add(account)
        db.flush()
    return account


@router.post("/upload", response_model=StatementUploadResult)
async def upload_statement(
    file: UploadFile,
    account_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
) -> StatementUploadResult:
    """Importa um extrato CSV do Nubank (conta corrente ou fatura de cartão).

    Se `account_id` não for informado, usa (ou cria) uma conta padrão
    conforme o tipo de extrato detectado.
    """
    content = await file.read()
    try:
        kind, parsed = parse_statement(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    account = _resolve_account(db, account_id, kind)

    external_ids = [t.external_id for t in parsed]
    existing: set[str] = set(
        db.scalars(
            select(Transaction.external_id).where(
                Transaction.external_id.in_(external_ids)
            )
        )
    )

    imported = 0
    for t in parsed:
        if t.external_id in existing:
            continue
        existing.add(t.external_id)
        db.add(
            Transaction(
                occurred_at=t.occurred_at,
                description=t.description,
                operation=t.operation,
                raw_description=t.raw_description,
                amount=t.amount,
                external_id=t.external_id,
                account_id=account.id,
            )
        )
        imported += 1

    db.commit()

    return StatementUploadResult(
        statement_kind=kind.value,
        account_id=account.id,
        account_name=account.name,
        total_rows=len(parsed),
        imported=imported,
        skipped_duplicates=len(parsed) - imported,
    )
