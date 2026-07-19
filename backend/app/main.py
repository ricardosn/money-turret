"""Ponto de entrada da API do dashboard financeiro."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (registra os modelos no metadata)
from app.database import Base, engine
from app.routers import analytics, categorization, statements, transactions


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
