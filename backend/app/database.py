"""Configuração do engine e da sessão do SQLAlchemy para o SQLite."""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:////app/data/finance.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarativa compartilhada por todos os modelos."""


def get_db() -> Generator[Session, None, None]:
    """Dependência do FastAPI que entrega uma sessão por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
