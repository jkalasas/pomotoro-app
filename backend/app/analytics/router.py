from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
from sqlmodel import select, and_

from ..db import SessionDep
from ..auth.deps import ActiveUserDep
from .models import AnalyticsEvent, SessionAnalytics, DailyStats, WeeklyStats
from .schemas import (
    AnalyticsEventCreate, 
    AnalyticsEventPublic,
    SessionAnalyticsPublic,
    DailyStatsPublic,
    WeeklyStatsPublic,
    ProductivityInsights,
    AnalyticsDashboard
)
from .service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.post("/events", response_model=AnalyticsEventPublic)
def log_analytics_event(
    db: SessionDep,
    event_data: AnalyticsEventCreate,
    current_user: ActiveUserDep
):
    """Log an analytics event"""
    event = AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type=event_data.event_type,
        event_data=event_data.event_data
    )
    
    return AnalyticsEventPublic(
        id=event.id,
        event_type=event.event_type,
        event_data=event.event_data,
        created_at=event.created_at
    )


@router.post("/user-action", response_model=AnalyticsEventPublic)
def log_user_action(
    db: SessionDep,
    current_user: ActiveUserDep,
    action: str,
    context: Optional[Dict[str, Any]] = None
):
    """Log a user interface action"""
    event = AnalyticsService.log_user_action(
        db=db,
        user_id=current_user.id,
        action=action,
        context=context
    )
    
    return AnalyticsEventPublic(
        id=event.id,
        event_type=event.event_type,
        event_data=event.event_data,
        created_at=event.created_at
    )


@router.post("/pomodoro-event", response_model=AnalyticsEventPublic)
def log_pomodoro_event(
    db: SessionDep,
    current_user: ActiveUserDep,
    event: str,
    session_id: int,
    context: Optional[Dict[str, Any]] = None
):
    """Log a pomodoro-related event"""
    kwargs = context or {}
    analytics_event = AnalyticsService.log_pomodoro_event(
        db=db,
        user_id=current_user.id,
        event=event,
        session_id=session_id,
        **kwargs
    )
    
    return AnalyticsEventPublic(
        id=analytics_event.id,
        event_type=analytics_event.event_type,
        event_data=analytics_event.event_data,
        created_at=analytics_event.created_at
    )


@router.get("/events", response_model=List[AnalyticsEventPublic])
def get_analytics_events(
    db: SessionDep,
    current_user: ActiveUserDep,
    event_type: Optional[str] = Query(None),
    days: int = Query(7, ge=1, le=90)
):
    """Get analytics events for the current user"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    query = select(AnalyticsEvent).where(
        and_(
            AnalyticsEvent.user_id == current_user.id,
            AnalyticsEvent.created_at >= start_date
        )
    )
    
    if event_type:
        query = query.where(AnalyticsEvent.event_type == event_type)
    
    events = db.exec(query.order_by(AnalyticsEvent.created_at.desc())).all()
    
    return [
        AnalyticsEventPublic(
            id=event.id,
            event_type=event.event_type,
            event_data=event.event_data,
            created_at=event.created_at
        )
        for event in events
    ]


@router.get("/daily-stats", response_model=List[DailyStatsPublic])
def get_daily_stats(
    db: SessionDep,
    current_user: ActiveUserDep,
    days: int = Query(30, ge=1, le=365)
):
    """Get daily statistics for the current user"""
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    daily_stats = db.exec(
        select(DailyStats).where(
            and_(
                DailyStats.user_id == current_user.id,
                DailyStats.date >= start_date,
                DailyStats.date <= end_date
            )
        ).order_by(DailyStats.date)
    ).all()
    
    return [
        DailyStatsPublic(
            id=stats.id,
            date=stats.date,
            total_focus_time=stats.total_focus_time,
            total_break_time=stats.total_break_time,
            sessions_completed=stats.sessions_completed,
            tasks_completed=stats.tasks_completed,
            pomodoros_completed=stats.pomodoros_completed,
            average_focus_duration=stats.average_focus_duration,
            interruptions_count=stats.interruptions_count,
            productivity_score=stats.productivity_score
        )
        for stats in daily_stats
    ]


@router.get("/session-analytics", response_model=List[SessionAnalyticsPublic])
def get_session_analytics(
    db: SessionDep,
    current_user: ActiveUserDep,
    days: int = Query(30, ge=1, le=90)
):
    """Get session analytics for the current user"""
    start_date = datetime.utcnow() - timedelta(days=days)
    
    session_analytics = db.exec(
        select(SessionAnalytics).where(
            and_(
                SessionAnalytics.user_id == current_user.id,
                SessionAnalytics.session_started_at >= start_date
            )
        ).order_by(SessionAnalytics.session_started_at.desc())
    ).all()
    
    return [
        SessionAnalyticsPublic(
            id=sa.id,
            session_id=sa.session_id,
            total_focus_time=sa.total_focus_time,
            total_break_time=sa.total_break_time,
            pomodoros_completed=sa.pomodoros_completed,
            tasks_completed=sa.tasks_completed,
            session_started_at=sa.session_started_at,
            session_ended_at=sa.session_ended_at,
            estimated_vs_actual_ratio=sa.estimated_vs_actual_ratio,
            interruptions_count=sa.interruptions_count,
            completion_rate=sa.completion_rate
        )
        for sa in session_analytics
    ]


@router.get("/insights", response_model=ProductivityInsights)
def get_productivity_insights(
    db: SessionDep,
    current_user: ActiveUserDep,
    days: int = Query(30, ge=7, le=90)
):
    """Get productivity insights for the current user"""
    return AnalyticsService.generate_productivity_insights(
        db=db,
        user_id=current_user.id,
        days=days
    )


@router.get("/dashboard", response_model=AnalyticsDashboard)
def get_analytics_dashboard(
    db: SessionDep,
    current_user: ActiveUserDep,
    days: int = Query(30, ge=7, le=90)
):
    """Get complete analytics dashboard data"""
    # Get daily stats
    daily_stats_response = get_daily_stats(db, current_user, days)
    
    # Get weekly stats (simplified - group daily stats by week)
    weekly_stats = []
    
    # Get insights
    insights = get_productivity_insights(db, current_user, days)
    
    # Get recent events
    recent_events_raw = AnalyticsService.get_events(db, current_user.id, days=7)
    recent_events = [
        AnalyticsEventPublic(
            id=event.id,
            event_type=event.event_type,
            event_data=event.event_data,
            created_at=event.created_at
        )
        for event in recent_events_raw[:10]  # Last 10 events
    ]
    
    # Get chart data
    chart_data = AnalyticsService.get_chart_data(db, current_user.id, days)
    
    return AnalyticsDashboard(
        daily_stats=daily_stats_response,
        weekly_stats=weekly_stats,
        productivity_insights=insights,
        recent_events=recent_events,
        focus_time_trend=chart_data["focus_time_trend"],
        task_completion_trend=chart_data["task_completion_trend"],
        productivity_heatmap=chart_data["productivity_heatmap"],
        session_duration_distribution=chart_data["session_duration_distribution"]
    )


@router.post("/update-daily-stats")
def update_daily_stats(
    db: SessionDep,
    current_user: ActiveUserDep,
    target_date: Optional[date] = None
):
    """Manually trigger daily stats update"""
    stats = AnalyticsService.update_daily_stats(
        db=db,
        user_id=current_user.id,
        target_date=target_date
    )
    
    return {"message": "Daily stats updated successfully", "date": stats.date}


@router.post("/session/{session_id}/start")
def start_session_tracking(
    db: SessionDep,
    session_id: int,
    current_user: ActiveUserDep
):
    """Start analytics tracking for a session"""
    # Log session start event
    AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type="session_start",
        event_data={"session_id": session_id}
    )
    
    # Start session analytics
    session_analytics = AnalyticsService.start_session_analytics(
        db=db,
        user_id=current_user.id,
        session_id=session_id
    )
    
    return {"message": "Session tracking started", "analytics_id": session_analytics.id}


@router.post("/session/{session_id}/end")
def end_session_tracking(
    db: SessionDep,
    session_id: int,
    current_user: ActiveUserDep
):
    """End analytics tracking for a session"""
    # Log session end event
    AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type="session_end",
        event_data={"session_id": session_id}
    )
    
    # End session analytics
    session_analytics = AnalyticsService.end_session_analytics(db=db, session_id=session_id)
    
    # Update daily stats
    AnalyticsService.update_daily_stats(db=db, user_id=current_user.id)
    
    return {"message": "Session tracking ended", "analytics_id": session_analytics.id if session_analytics else None}
