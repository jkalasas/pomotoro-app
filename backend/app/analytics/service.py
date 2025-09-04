import json
from typing import Dict, Any, List, Optional
from datetime import datetime, date, timedelta
from sqlmodel import select, and_
from ..db import SessionDep
from .models import AnalyticsEvent, SessionAnalytics, DailyStats, WeeklyStats
from ..models import Task, PomodoroSession, ActivePomodoroSession
from .schemas import ProductivityInsights


class AnalyticsService:
    """Service for handling analytics operations"""
    
    @staticmethod
    def log_event(db: SessionDep, user_id: int, event_type: str, event_data: Optional[Dict[str, Any]] = None):
        """Log an analytics event"""
        event = AnalyticsEvent(
            user_id=user_id,
            event_type=event_type,
            event_data=json.dumps(event_data) if event_data else None
        )
        db.add(event)
        db.commit()
        return event
    
    @staticmethod
    def start_session_analytics(db: SessionDep, user_id: int, session_id: int):
        """Start tracking analytics for a session"""
        session_analytics = SessionAnalytics(
            user_id=user_id,
            session_id=session_id,
            session_started_at=datetime.utcnow()
        )
        db.add(session_analytics)
        db.commit()
        return session_analytics
    
    @staticmethod
    def update_session_analytics(db: SessionDep, session_id: int, **kwargs):
        """Update session analytics with new data"""
        analytics = db.exec(
            select(SessionAnalytics).where(SessionAnalytics.session_id == session_id)
        ).first()
        
        if analytics:
            for key, value in kwargs.items():
                if hasattr(analytics, key):
                    setattr(analytics, key, value)
            db.add(analytics)
            db.commit()
        
        return analytics
    
    @staticmethod
    def end_session_analytics(db: SessionDep, session_id: int):
        """End session analytics and calculate final metrics"""
        analytics = db.exec(
            select(SessionAnalytics).where(SessionAnalytics.session_id == session_id)
        ).first()
        
        if analytics:
            analytics.session_ended_at = datetime.utcnow()
            
            # Calculate completion rate
            session = db.get(PomodoroSession, session_id)
            if session and session.tasks:
                completed_tasks = sum(1 for task in session.tasks if task.completed)
                analytics.completion_rate = completed_tasks / len(session.tasks)
                analytics.tasks_completed = completed_tasks
                
                # Calculate estimated vs actual ratio
                total_estimated = sum(task.estimated_completion_time for task in session.tasks if task.completed)
                total_actual = sum(task.actual_completion_time for task in session.tasks if task.completed and task.actual_completion_time)
                
                if total_estimated > 0 and total_actual > 0:
                    analytics.estimated_vs_actual_ratio = total_actual / total_estimated
            
            db.add(analytics)
            db.commit()
        
        return analytics
    
    @staticmethod
    def update_daily_stats(db: SessionDep, user_id: int, target_date: Optional[date] = None):
        """Update daily statistics for a user"""
        if not target_date:
            target_date = date.today()
        
        # Get or create daily stats
        daily_stats = db.exec(
            select(DailyStats).where(
                and_(
                    DailyStats.user_id == user_id,
                    DailyStats.date == target_date
                )
            )
        ).first()
        
        if not daily_stats:
            daily_stats = DailyStats(user_id=user_id, date=target_date)
        
        # Calculate daily metrics from session analytics
        day_start = datetime.combine(target_date, datetime.min.time())
        day_end = datetime.combine(target_date, datetime.max.time())
        
        session_analytics = db.exec(
            select(SessionAnalytics).where(
                and_(
                    SessionAnalytics.user_id == user_id,
                    SessionAnalytics.session_started_at >= day_start,
                    SessionAnalytics.session_started_at <= day_end
                )
            )
        ).all()
        
        # Count session feedback events
        from ..models import SessionFeedback
        session_feedbacks = db.exec(
            select(SessionFeedback).where(
                and_(
                    SessionFeedback.user_id == user_id,
                    SessionFeedback.created_at >= day_start,
                    SessionFeedback.created_at <= day_end
                )
            )
        ).all()
        
        # Aggregate metrics
        daily_stats.total_focus_time = sum(sa.total_focus_time for sa in session_analytics)
        daily_stats.total_break_time = sum(sa.total_break_time for sa in session_analytics)
        daily_stats.sessions_completed = len(session_feedbacks)  # Use feedback count for completed sessions
        daily_stats.tasks_completed = sum(sa.tasks_completed for sa in session_analytics)
        daily_stats.pomodoros_completed = sum(sa.pomodoros_completed for sa in session_analytics)
        daily_stats.interruptions_count = sum(sa.interruptions_count for sa in session_analytics)
        
        # Calculate average focus duration
        if daily_stats.pomodoros_completed > 0:
            daily_stats.average_focus_duration = daily_stats.total_focus_time / daily_stats.pomodoros_completed
        
        # Calculate productivity score (0-100)
        productivity_score = 0
        if daily_stats.sessions_completed > 0:
            completion_rate = sum(sa.completion_rate or 0 for sa in session_analytics) / len(session_analytics)
            focus_efficiency = min(daily_stats.total_focus_time / (8 * 3600), 1.0)  # 8 hours max
            interruption_penalty = max(0, 1 - (daily_stats.interruptions_count * 0.1))
            productivity_score = (completion_rate * 0.4 + focus_efficiency * 0.4 + interruption_penalty * 0.2) * 100
        
        daily_stats.productivity_score = productivity_score
        daily_stats.updated_at = datetime.utcnow()
        
        db.add(daily_stats)
        db.commit()
        
        return daily_stats
    
    @staticmethod
    def generate_productivity_insights(db: SessionDep, user_id: int, days: int = 30) -> ProductivityInsights:
        """Generate productivity insights for a user"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        # Get daily stats for the period
        daily_stats = db.exec(
            select(DailyStats).where(
                and_(
                    DailyStats.user_id == user_id,
                    DailyStats.date >= start_date,
                    DailyStats.date <= end_date
                )
            ).order_by(DailyStats.date)
        ).all()
        
        if not daily_stats:
            return ProductivityInsights(
                most_productive_time="No data available",
                average_session_length=0,
                completion_rate_trend="No data",
                focus_time_trend="No data",
                recommendations=["Start using the app more regularly to get insights!"]
            )
        
        # Calculate insights
        total_focus_time = sum(ds.total_focus_time for ds in daily_stats)
        total_sessions = sum(ds.sessions_completed for ds in daily_stats)
        
        average_session_length = total_focus_time / total_sessions if total_sessions > 0 else 0
        
        # Get session feedback data for focus level insights
        from ..models import SessionFeedback
        session_feedbacks = db.exec(
            select(SessionFeedback).where(
                and_(
                    SessionFeedback.user_id == user_id,
                    SessionFeedback.created_at >= datetime.combine(start_date, datetime.min.time()),
                    SessionFeedback.created_at <= datetime.combine(end_date, datetime.max.time())
                )
            )
        ).all()
        
        # Analyze focus levels
        focus_levels = [sf.focus_level for sf in session_feedbacks]
        most_common_focus_level = None
        if focus_levels:
            from collections import Counter
            focus_counter = Counter(focus_levels)
            most_common_focus_level = focus_counter.most_common(1)[0][0]
        
        # Determine trends
        recent_stats = daily_stats[-7:] if len(daily_stats) >= 7 else daily_stats
        older_stats = daily_stats[-14:-7] if len(daily_stats) >= 14 else []
        
        focus_time_trend = "stable"
        if older_stats:
            recent_avg_focus = sum(ds.total_focus_time for ds in recent_stats) / len(recent_stats)
            older_avg_focus = sum(ds.total_focus_time for ds in older_stats) / len(older_stats)
            
            if recent_avg_focus > older_avg_focus * 1.1:
                focus_time_trend = "improving"
            elif recent_avg_focus < older_avg_focus * 0.9:
                focus_time_trend = "declining"
        
        # Generate recommendations
        recommendations = []
        avg_productivity = sum(ds.productivity_score or 0 for ds in daily_stats) / len(daily_stats)
        
        if avg_productivity < 60:
            recommendations.append("Try reducing interruptions during focus time")
        if average_session_length < 1500:  # 25 minutes
            recommendations.append("Consider extending your focus periods")
        if focus_time_trend == "declining":
            recommendations.append("Your focus time is declining - try setting smaller, more achievable goals")
        
        # Add focus level recommendations
        if most_common_focus_level:
            if most_common_focus_level in ["HIGHLY_DISTRACTED", "DISTRACTED"]:
                recommendations.append("Your sessions show low focus levels - try eliminating distractions")
            elif most_common_focus_level in ["FOCUSED", "HIGHLY_FOCUSED"]:
                recommendations.append("Great focus levels! Consider challenging yourself with longer sessions")
        
        if len(session_feedbacks) < total_sessions * 0.5:
            recommendations.append("Submit session feedback more regularly to get better insights")
            
        if not recommendations:
            recommendations.append("Keep up the great work! Your productivity is on track.")
        
        return ProductivityInsights(
            most_productive_time="Morning sessions show highest completion rates",  # Could be enhanced with hour-based analysis
            average_session_length=average_session_length / 60,  # Convert to minutes
            completion_rate_trend="stable",  # Could be calculated more precisely
            focus_time_trend=focus_time_trend,
            recommendations=recommendations
        )
    
    @staticmethod
    def get_events(db: SessionDep, user_id: int, event_type: Optional[str] = None, days: int = 7):
        """Get analytics events for a user"""
        start_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(AnalyticsEvent).where(
            and_(
                AnalyticsEvent.user_id == user_id,
                AnalyticsEvent.created_at >= start_date
            )
        )
        
        if event_type:
            query = query.where(AnalyticsEvent.event_type == event_type)
        
        events = db.exec(query.order_by(AnalyticsEvent.created_at.desc())).all()
        return events
    
    @staticmethod
    def get_chart_data(db: SessionDep, user_id: int, days: int = 30):
        """Get data formatted for charts"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        daily_stats = db.exec(
            select(DailyStats).where(
                and_(
                    DailyStats.user_id == user_id,
                    DailyStats.date >= start_date,
                    DailyStats.date <= end_date
                )
            ).order_by(DailyStats.date)
        ).all()
        
        # Focus time trend
        focus_time_trend = [
            {
                "date": ds.date.isoformat(),
                "focus_time": ds.total_focus_time / 3600,  # Convert to hours
                "break_time": ds.total_break_time / 3600
            }
            for ds in daily_stats
        ]
        
        # Task completion trend
        task_completion_trend = [
            {
                "date": ds.date.isoformat(),
                "completed": ds.tasks_completed,
                "sessions": ds.sessions_completed
            }
            for ds in daily_stats
        ]
        
        # Productivity heatmap (simplified - could be enhanced)
        productivity_heatmap = [
            {
                "date": ds.date.isoformat(),
                "productivity": ds.productivity_score or 0
            }
            for ds in daily_stats
        ]
        
        # Session duration distribution
        session_analytics = db.exec(
            select(SessionAnalytics).where(
                and_(
                    SessionAnalytics.user_id == user_id,
                    SessionAnalytics.session_started_at >= datetime.combine(start_date, datetime.min.time())
                )
            )
        ).all()
        
        # Group by duration ranges
        duration_ranges = {"0-30min": 0, "30-60min": 0, "60-120min": 0, "120min+": 0}
        for sa in session_analytics:
            duration_min = sa.total_focus_time / 60
            if duration_min <= 30:
                duration_ranges["0-30min"] += 1
            elif duration_min <= 60:
                duration_ranges["30-60min"] += 1
            elif duration_min <= 120:
                duration_ranges["60-120min"] += 1
            else:
                duration_ranges["120min+"] += 1
        
        session_duration_distribution = [
            {"range": k, "count": v} for k, v in duration_ranges.items()
        ]
        
        return {
            "focus_time_trend": focus_time_trend,
            "task_completion_trend": task_completion_trend,
            "productivity_heatmap": productivity_heatmap,
            "session_duration_distribution": session_duration_distribution
        }
