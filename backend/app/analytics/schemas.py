from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any


class AnalyticsEventCreate(BaseModel):
    event_type: str
    event_data: Optional[Dict[str, Any]] = None


class AnalyticsEventPublic(BaseModel):
    id: int
    event_type: str
    event_data: Optional[str]
    created_at: datetime


class SessionAnalyticsPublic(BaseModel):
    id: int
    session_id: int
    total_focus_time: int
    total_break_time: int
    pomodoros_completed: int
    tasks_completed: int
    session_started_at: datetime
    session_ended_at: Optional[datetime]
    estimated_vs_actual_ratio: Optional[float]
    interruptions_count: int
    completion_rate: Optional[float]


class DailyStatsPublic(BaseModel):
    id: int
    date: datetime
    total_focus_time: int
    total_break_time: int
    sessions_completed: int
    tasks_completed: int
    pomodoros_completed: int
    average_focus_duration: Optional[float]
    interruptions_count: int
    productivity_score: Optional[float]


class WeeklyStatsPublic(BaseModel):
    id: int
    week_start: datetime
    total_focus_time: int
    total_break_time: int
    sessions_completed: int
    tasks_completed: int
    pomodoros_completed: int
    active_days: int
    average_daily_focus_time: Optional[float]
    consistency_score: Optional[float]
    productivity_trend: Optional[str]


class ProductivityInsights(BaseModel):
    """Insights and recommendations based on analytics data"""
    most_productive_time: Optional[str]
    average_session_length: float
    completion_rate_trend: str
    focus_time_trend: str
    recommendations: List[str]


class AnalyticsDashboard(BaseModel):
    """Complete analytics dashboard data"""
    daily_stats: List[DailyStatsPublic]
    weekly_stats: List[WeeklyStatsPublic]
    productivity_insights: ProductivityInsights
    recent_events: List[AnalyticsEventPublic]
    
    # Chart data
    focus_time_trend: List[Dict[str, Any]]
    task_completion_trend: List[Dict[str, Any]]
    productivity_heatmap: List[Dict[str, Any]]
    session_duration_distribution: List[Dict[str, Any]]
