from sqlmodel import SQLModel, create_engine, Session, select
from app.config import settings

DATABASE_URL = settings.database_url
engine = create_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})


def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

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
