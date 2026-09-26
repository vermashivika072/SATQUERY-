from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Separate engine for SatQuery if it lives elsewhere
satquery_engine = create_engine(
    settings.satquery_database_url,
    pool_pre_ping=True,
    future=True,
)
SatQuerySession = sessionmaker(bind=satquery_engine, autoflush=False)


def get_satquery_db() -> Session:
    db = SatQuerySession()
    try:
        yield db
    finally:
        db.close()