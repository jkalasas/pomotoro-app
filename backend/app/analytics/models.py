from typing import Optional
from datetime import datetime
from sqlmodel import Field as SQLField, SQLModel, Relationship
from ..users.models import User


class AnalyticsEvent(SQLModel, table=True):
    """Track various user events for analytics"""
    __tablename__ = "analytics_event"
    
    id: Optional[int] = SQLField(default=None, primary_key=True)
    user_id: int = SQLField(foreign_key="user.id", index=True)
    event_type: str = SQLField(index=True)  # 'session_switch', 'task_complete', 'pomodoro_complete', 'break_start', etc.
    event_data: Optional[str] = None  # JSON string for additional data
    created_at: datetime = SQLField(default_factory=datetime.utcnow, index=True)
    
    # Relations
    user: Optional[User] = Relationship(back_populates="analytics_events")


class SessionAnalytics(SQLModel, table=True):
    """Detailed analytics for pomodoro sessions"""
    __tablename__ = "session_analytics"
    
    id: Optional[int] = SQLField(default=None, primary_key=True)
    user_id: int = SQLField(foreign_key="user.id", index=True)
    session_id: int = SQLField(foreign_key="session.id", index=True)
    
    # Session metrics
    total_focus_time: int = 0  # in seconds
    total_break_time: int = 0  # in seconds
    pomodoros_completed: int = 0
    tasks_completed: int = 0
    session_started_at: datetime
    session_ended_at: Optional[datetime] = None
    
    # Productivity metrics
    estimated_vs_actual_ratio: Optional[float] = None  # actual_time / estimated_time
    interruptions_count: int = 0  # pauses during focus time
    completion_rate: Optional[float] = None  # completed_tasks / total_tasks
    
    created_at: datetime = SQLField(default_factory=datetime.utcnow, index=True)
    
    # Relations
    user: Optional[User] = Relationship(back_populates="session_analytics")


class DailyStats(SQLModel, table=True):
    """Daily aggregated statistics for users"""
    __tablename__ = "daily_stats"
    
    id: Optional[int] = SQLField(default=None, primary_key=True)
    user_id: int = SQLField(foreign_key="user.id", index=True)
    date: datetime = SQLField(index=True)  # date of the stats
    
    # Daily metrics
    total_focus_time: int = 0  # in seconds
    total_break_time: int = 0  # in seconds
    sessions_completed: int = 0
    tasks_completed: int = 0
    pomodoros_completed: int = 0
    
    # Productivity metrics
    average_focus_duration: Optional[float] = None  # average length of focus periods
    interruptions_count: int = 0
    productivity_score: Optional[float] = None  # calculated score based on various factors
    
    created_at: datetime = SQLField(default_factory=datetime.utcnow)
    updated_at: datetime = SQLField(default_factory=datetime.utcnow)
    
    # Relations
    user: Optional[User] = Relationship(back_populates="daily_stats")


class WeeklyStats(SQLModel, table=True):
    """Weekly aggregated statistics for users"""
    __tablename__ = "weekly_stats"
    
    id: Optional[int] = SQLField(default=None, primary_key=True)
    user_id: int = SQLField(foreign_key="user.id", index=True)
    week_start: datetime = SQLField(index=True)  # Monday of the week
    
    # Weekly metrics
    total_focus_time: int = 0  # in seconds
    total_break_time: int = 0  # in seconds
    sessions_completed: int = 0
    tasks_completed: int = 0
    pomodoros_completed: int = 0
    active_days: int = 0  # number of days user was active
    
    # Productivity metrics
    average_daily_focus_time: Optional[float] = None
    consistency_score: Optional[float] = None  # how consistent was the user across the week
    productivity_trend: Optional[str] = None  # 'improving', 'declining', 'stable'
    
    created_at: datetime = SQLField(default_factory=datetime.utcnow)
    updated_at: datetime = SQLField(default_factory=datetime.utcnow)
    
    # Relations
    user: Optional[User] = Relationship(back_populates="weekly_stats")
