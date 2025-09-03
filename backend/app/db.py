from typing import Annotated

from fastapi import Depends
from sqlmodel import SQLModel, create_engine, Session, select
from app.config import settings
from app.models import PomodoroSession
# Import analytics models to ensure they're registered
from app.analytics.models import AnalyticsEvent, SessionAnalytics, DailyStats, WeeklyStats

DATABASE_URL = settings.database_url
engine = create_engine(
    DATABASE_URL, echo=True, connect_args={"check_same_thread": False}
)


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

    # Migrate existing sessions to add name field if missing
    with Session(engine) as session:
        try:
            # Check if name column exists by trying to query it
            session.exec(select(PomodoroSession).where(PomodoroSession.name == "")).first()
        except Exception:
            # If there's an error, the column might not exist, try to add it
            try:
                session.exec("ALTER TABLE session ADD COLUMN name TEXT DEFAULT ''")
                session.commit()
                print("Added name column to session table")
            except Exception as e:
                print(f"Could not add name column: {e}")

    # seed basic categories if empty
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
