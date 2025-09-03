from typing import Optional, List, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from ..models import PomodoroSession, ActivePomodoroSession  # noqa: F401
    from ..analytics.models import AnalyticsEvent, SessionAnalytics, DailyStats, WeeklyStats  # noqa: F401


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    first_name: str
    middle_name: Optional[str]
    last_name: str
    email: str = Field(index=True, unique=True)
    password: str

    sessions: List["PomodoroSession"] = Relationship(back_populates="user")
    active_session: Optional["ActivePomodoroSession"] = Relationship(back_populates="user")
    
    # Analytics relationships
    analytics_events: List["AnalyticsEvent"] = Relationship(back_populates="user")
    session_analytics: List["SessionAnalytics"] = Relationship(back_populates="user")
    daily_stats: List["DailyStats"] = Relationship(back_populates="user")
    weekly_stats: List["WeeklyStats"] = Relationship(back_populates="user")
