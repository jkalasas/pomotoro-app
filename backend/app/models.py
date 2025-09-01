from typing import List, Optional, TYPE_CHECKING
from sqlmodel import Field as SQLField, SQLModel, Relationship

if TYPE_CHECKING:
    from .users.models import User  # noqa: F401


class TaskCategoryLink(SQLModel, table=True):
    task_id: Optional[int] = SQLField(
        default=None, foreign_key="task.id", primary_key=True
    )
    category_id: Optional[int] = SQLField(
        default=None, foreign_key="category.id", primary_key=True
    )


class Category(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True, unique=True)
    tasks: List["Task"] = Relationship(
        back_populates="categories", link_model=TaskCategoryLink
    )


class PomodoroSession(SQLModel, table=True):
    __tablename__ = "session"
    id: Optional[int] = SQLField(default=None, primary_key=True)
    description: str
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int
    user_id: Optional[int] = SQLField(default=None, foreign_key="user.id", index=True)
    tasks: List["Task"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    user: Optional["User"] = Relationship(back_populates="sessions")


class Task(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True)
    session_id: Optional[int] = SQLField(
        default=None, foreign_key="session.id", index=True
    )
    estimated_completion_time: int
    actual_completion_time: Optional[int] = None
    categories: List[Category] = Relationship(
        back_populates="tasks", link_model=TaskCategoryLink
    )
    session: Optional[PomodoroSession] = Relationship(back_populates="tasks")
