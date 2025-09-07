from typing import List, Optional, TYPE_CHECKING
from datetime import datetime
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
    name: str = SQLField(default="")
    description: str
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int
    user_id: Optional[int] = SQLField(default=None, foreign_key="user.id", index=True)
    completed: bool = SQLField(default=False)
    completed_at: Optional[datetime] = None
    archived: bool = SQLField(default=False, index=True)
    archived_at: Optional[datetime] = None
    tasks: List["Task"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    user: Optional["User"] = Relationship(back_populates="sessions")
    active_session: Optional["ActivePomodoroSession"] = Relationship(back_populates="session")
    feedbacks: List["SessionFeedback"] = Relationship(back_populates="session")


class ActivePomodoroSession(SQLModel, table=True):
    __tablename__ = "active_session"
    id: Optional[int] = SQLField(default=None, primary_key=True)
    user_id: int = SQLField(foreign_key="user.id", index=True, unique=True)
    session_id: int = SQLField(foreign_key="session.id", index=True)
    current_task_id: Optional[int] = SQLField(default=None, foreign_key="task.id")
    is_running: bool = SQLField(default=False)
    time_remaining: int  # in seconds
    phase: str  # "focus", "short_break", "long_break"
    pomodoros_completed: int = SQLField(default=0)
    start_time: Optional[datetime] = None
    pause_time: Optional[datetime] = None

    user: Optional["User"] = Relationship(back_populates="active_session")
    session: Optional["PomodoroSession"] = Relationship(back_populates="active_session")
    current_task: Optional["Task"] = Relationship(back_populates="active_sessions")


class Task(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True)
    session_id: Optional[int] = SQLField(
        default=None, foreign_key="session.id", index=True
    )
    estimated_completion_time: int
    actual_completion_time: Optional[int] = None
    due_date: Optional[datetime] = None  # Add due date for urgency calculations
    completed: bool = SQLField(default=False)
    completed_at: Optional[datetime] = None
    archived: bool = SQLField(default=False, index=True)
    archived_at: Optional[datetime] = None
    categories: List[Category] = Relationship(
        back_populates="tasks", link_model=TaskCategoryLink
    )
    session: Optional[PomodoroSession] = Relationship(back_populates="tasks")
    active_sessions: List["ActivePomodoroSession"] = Relationship(back_populates="current_task")


class SessionFeedback(SQLModel, table=True):
    __tablename__ = "session_feedback"
    id: Optional[int] = SQLField(default=None, primary_key=True)
    session_id: int = SQLField(foreign_key="session.id", index=True)
    user_id: int = SQLField(foreign_key="user.id", index=True)
    focus_level: str = SQLField(index=True)  # "HIGHLY_DISTRACTED", "DISTRACTED", "NEUTRAL", "FOCUSED", "HIGHLY_FOCUSED"
    session_reflection: Optional[str] = None
    tasks_completed: int = SQLField(default=0)
    tasks_failed: int = SQLField(default=0)
    focus_duration_minutes: int = SQLField(default=0)
    created_at: datetime = SQLField(default_factory=datetime.utcnow)
    
    session: Optional["PomodoroSession"] = Relationship(back_populates="feedbacks")
    user: Optional["User"] = Relationship(back_populates="session_feedbacks")
