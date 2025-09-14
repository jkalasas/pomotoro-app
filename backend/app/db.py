from typing import Annotated

from fastapi import Depends
from sqlmodel import SQLModel, create_engine, Session, select
from sqlalchemy import text
from app.config import settings
from app.models import PomodoroSession
# Import analytics models to ensure they're registered
from app.analytics.models import AnalyticsEvent, SessionAnalytics, DailyStats, WeeklyStats

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

    # Migrate existing sessions to add name field if missing
    with Session(engine) as session:
        try:
            # Check if name column exists by trying to query it
            session.exec(select(PomodoroSession).where(PomodoroSession.name == "")).first()
        except Exception:
            # If there's an error, the column might not exist, try to add it
            try:
                session.exec(text("ALTER TABLE session ADD COLUMN name TEXT DEFAULT ''"))
                session.commit()
                print("Added name column to session table")
            except Exception as e:
                print(f"Could not add name column: {e}")

        # Add archived columns if they don't exist
        try:
            session.exec(text("SELECT archived FROM session LIMIT 1"))
        except Exception:
            try:
                session.exec(text("ALTER TABLE session ADD COLUMN archived BOOLEAN DEFAULT 0"))
                session.exec(text("ALTER TABLE session ADD COLUMN archived_at TIMESTAMP NULL"))
                session.commit()
                print("Added archived columns to session table")
            except Exception as e:
                print(f"Could not add archived columns: {e}")

        # Add soft delete columns if they don't exist (session)
        try:
            session.exec(text("SELECT is_deleted FROM session LIMIT 1"))
        except Exception:
            try:
                session.exec(text("ALTER TABLE session ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
                session.exec(text("ALTER TABLE session ADD COLUMN deleted_at TIMESTAMP NULL"))
                session.commit()
                print("Added soft delete columns to session table")
            except Exception as e:
                print(f"Could not add soft delete columns to session: {e}")

        try:
            session.exec(text("SELECT archived FROM task LIMIT 1"))
        except Exception:
            try:
                session.exec(text("ALTER TABLE task ADD COLUMN archived BOOLEAN DEFAULT 0"))
                session.exec(text("ALTER TABLE task ADD COLUMN archived_at TIMESTAMP NULL"))
                session.commit()
                print("Added archived columns to task table")
            except Exception as e:
                print(f"Could not add archived columns to task: {e}")

        # Add soft delete columns if they don't exist (task)
        try:
            session.exec(text("SELECT is_deleted FROM task LIMIT 1"))
        except Exception:
            try:
                session.exec(text("ALTER TABLE task ADD COLUMN is_deleted BOOLEAN DEFAULT 0"))
                session.exec(text("ALTER TABLE task ADD COLUMN deleted_at TIMESTAMP NULL"))
                session.commit()
                print("Added soft delete columns to task table")
            except Exception as e:
                print(f"Could not add soft delete columns to task: {e}")

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
