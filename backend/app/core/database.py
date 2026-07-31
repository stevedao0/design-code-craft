from __future__ import annotations

import os
from urllib.parse import urlparse

from dotenv import load_dotenv
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_PATH = _BACKEND_ROOT / ".env"
# Only load backend/.env for local dev — in Docker/production, env vars come
# from env_file in docker-compose.prod.yml and must not be overridden.
if _ENV_PATH.exists() and os.getenv("APP_ENV") != "production":
    load_dotenv(_ENV_PATH, override=True)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DB_MODE = os.getenv("DB_MODE", "main").strip().lower()

Base = declarative_base()

# Build database URL from env — no hardcoding
database_url = os.getenv("DATABASE_URL", "")
if not database_url:
    raise RuntimeError("DATABASE_URL is required for backend startup")

engine = create_engine(database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def startup_database_guard() -> str:
    """Verify startup DB connection.

    MAIN DB ONLY policy: clone DB restrictions removed.
    This guard only validates the connection works and returns the DB name.
    No port restrictions.
    """
    with engine.connect() as conn:
        current_db = str(conn.execute(text("select current_database()")).scalar_one())
    return current_db
