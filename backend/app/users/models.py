from typing import Optional, List, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from ..models import PomodoroSession  # noqa: F401


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    first_name: str
    middle_name: Optional[str]
    last_name: str
    email: str = Field(index=True, unique=True)
    password: str

    sessions: List["PomodoroSession"] = Relationship(back_populates="user")
