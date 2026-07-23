"""Ponto de entrada da API do dashboard financeiro."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (registra os modelos no metadata)
from app.database import Base, SessionLocal, engine
from app.ingestion import is_internal_transfer
from app.routers import analytics, categorization, statements, transactions


def _backfill_internal_transfers() -> None:
    """Recalcula is_internal_transfer para transações importadas antes da
    coluna existir, usando a mesma lógica aplicada na ingestão."""
    db = SessionLocal()
    try:
        rows = db.execute(
            models.Transaction.__table__.select().with_only_columns(
                models.Transaction.id,
                models.Transaction.operation,
                models.Transaction.raw_description,
                models.Transaction.description,
            )
        ).all()
        for row in rows:
            flag = is_internal_transfer(
                row.operation, row.raw_description or row.description
            )
            if flag:
                db.execute(
                    models.Transaction.__table__.update()
                    .where(models.Transaction.id == row.id)
                    .values(is_internal_transfer=True)
                )
        db.commit()
    finally:
        db.close()


def _ensure_schema() -> None:
    """create_all + micro-migração: create_all não adiciona colunas novas
    em tabelas existentes no SQLite, então garantimos manualmente."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        columns = {
            row[1] for row in conn.exec_driver_sql("PRAGMA table_info(categories)")
        }
        if "is_fixed" not in columns:
            conn.exec_driver_sql(
                "ALTER TABLE categories ADD COLUMN is_fixed BOOLEAN NOT NULL DEFAULT 0"
            )

        tx_columns = {
            row[1] for row in conn.exec_driver_sql("PRAGMA table_info(transactions)")
        }
        if "is_internal_transfer" not in tx_columns:
            conn.exec_driver_sql(
                "ALTER TABLE transactions ADD COLUMN is_internal_transfer "
                "BOOLEAN NOT NULL DEFAULT 0"
            )
            needs_backfill = True
        else:
            needs_backfill = False

    if needs_backfill:
        _backfill_internal_transfers()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Garante que o schema exista antes de aceitar requests."""
    _ensure_schema()
    yield


app = FastAPI(
    title="Dashboard Financeiro Nubank",
    description="API de análise objetiva de gastos e planejamento de metas.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(statements.router)
app.include_router(categorization.router)
app.include_router(analytics.router)
app.include_router(transactions.router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check simples para o Docker e o frontend."""
    return {"status": "ok", "service": "money-turret-backend"}
