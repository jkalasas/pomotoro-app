from typing import Annotated

from fastapi import Depends
from sqlmodel import SQLModel, create_engine, Session, select
from app.config import settings
from app.models import PomodoroSession

from app.analytics.models import (
    AnalyticsEvent,
    SessionAnalytics,
    DailyStats,
    WeeklyStats,
)

DATABASE_URL = settings.database_url

connect_args = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL, echo=settings.database_echo, connect_args=connect_args
)


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

    from .models import Category

    with Session(engine) as session:
        existing = session.exec(select(Category)).first()
        if not existing:
            backend_dev = Category(name="Backend Development")
            auth_cat = Category(name="Authentication")
            security_cat = Category(name="Security")
            db_cat = Category(name="Database")
            doc_cat = Category(name="Documentation")
            session.add_all([backend_dev, auth_cat, security_cat, db_cat, doc_cat])
            session.commit()


SessionDep = Annotated[Session, Depends(get_session)]
