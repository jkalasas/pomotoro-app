"""
Service for calculating user analytics and performance metrics
used by the genetic algorithm.
"""
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from sqlmodel import Session, select

from ..models import Task, SessionFeedback, PomodoroSession
from ..users.models import User
from ..analytics.models import DailyStats, WeeklyStats


class UserAnalyticsService:
    """
    Service for calculating user performance metrics for the genetic algorithm.
    """
    
    @staticmethod
    def calculate_completion_rate(user: User, db: Session, days: int = 30) -> float:
        """
        Calculate user's task completion rate over the last N days.
        """
        # Get user's sessions from the last N days
        cutoff_date = datetime.now() - timedelta(days=days)
        
        sessions = db.exec(
            select(PomodoroSession)
            .where(PomodoroSession.user_id == user.id)
            .where(PomodoroSession.completed_at >= cutoff_date)
            .where(PomodoroSession.is_deleted == False)  # noqa: E712
        ).all()
        
        if not sessions:
            return 0.5  # Default if no recent sessions
        
        total_tasks = 0
        completed_tasks = 0
        
        for session in sessions:
            session_tasks = [task for task in session.tasks if not task.is_deleted]
            total_tasks += len(session_tasks)
            completed_tasks += len([task for task in session_tasks if task.completed])
        
        if total_tasks == 0:
            return 0.5
        
        return completed_tasks / total_tasks
    
    @staticmethod
    def calculate_average_focus_level(user: User, db: Session, days: int = 30) -> float:
        """
        Calculate user's average focus level based on session feedback.
        Returns a value between 1 (highly distracted) and 5 (highly focused).
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        feedbacks = db.exec(
            select(SessionFeedback)
            .where(SessionFeedback.user_id == user.id)
            .where(SessionFeedback.created_at >= cutoff_date)
        ).all()
        
        if not feedbacks:
            return 3.0  # Default neutral
        
        feedback_mapping = {
            "HIGHLY_DISTRACTED": 1,
            "DISTRACTED": 2,
            "NEUTRAL": 3,
            "FOCUSED": 4,
            "HIGHLY_FOCUSED": 5
        }
        
        focus_scores = [feedback_mapping.get(f.focus_level, 3) for f in feedbacks]
        return sum(focus_scores) / len(focus_scores)
    
    @staticmethod
    def calculate_estimated_vs_actual_ratio(user: User, db: Session, days: int = 30) -> float:
        """
        Calculate the ratio of actual completion time to estimated completion time.
        Values > 1 indicate the user generally takes longer than estimated.
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Get completed tasks with both estimated and actual completion times
        sessions = db.exec(
            select(PomodoroSession)
            .where(PomodoroSession.user_id == user.id)
            .where(PomodoroSession.completed_at >= cutoff_date)
            .where(PomodoroSession.is_deleted == False)  # noqa: E712
        ).all()
        
        total_estimated = 0
        total_actual = 0
        
        for session in sessions:
            for task in session.tasks:
                if (not task.is_deleted) and task.completed and task.actual_completion_time:
                    total_estimated += task.estimated_completion_time
                    total_actual += task.actual_completion_time
        
        if total_estimated == 0:
            return 1.0  # Default ratio
        
        return total_actual / total_estimated
    
    @staticmethod
    def get_task_category_performance(user: User, db: Session) -> Dict[str, float]:
        """
        Get completion rates by task category for the user.
        """
        sessions = db.exec(
            select(PomodoroSession)
            .where(PomodoroSession.user_id == user.id)
            .where(PomodoroSession.is_deleted == False)  # noqa: E712
        ).all()
        
        category_stats = {}
        
        for session in sessions:
            for task in session.tasks:
                for category in task.categories:
                    cat_name = category.name
                    if cat_name not in category_stats:
                        category_stats[cat_name] = {"total": 0, "completed": 0}
                    
                    if not task.is_deleted:
                        category_stats[cat_name]["total"] += 1
                    if (not task.is_deleted) and task.completed:
                        category_stats[cat_name]["completed"] += 1
        
        # Calculate completion rates
        completion_rates = {}
        for cat_name, stats in category_stats.items():
            if stats["total"] > 0:
                completion_rates[cat_name] = stats["completed"] / stats["total"]
            else:
                completion_rates[cat_name] = 0.0
        
        return completion_rates
    
    @staticmethod
    def get_time_of_day_performance(user: User, db: Session) -> Dict[str, float]:
        """
        Get completion rates by time of day (morning, afternoon, evening).
        """
        sessions = db.exec(
            select(PomodoroSession)
            .where(PomodoroSession.user_id == user.id)
            .where(PomodoroSession.completed_at.isnot(None))
            .where(PomodoroSession.is_deleted == False)  # noqa: E712
        ).all()
        
        time_stats = {
            "morning": {"total": 0, "completed": 0},    # 6-12
            "afternoon": {"total": 0, "completed": 0},  # 12-18
            "evening": {"total": 0, "completed": 0}     # 18-24
        }
        
        for session in sessions:
            if session.completed_at:
                hour = session.completed_at.hour
                
                if 6 <= hour < 12:
                    time_period = "morning"
                elif 12 <= hour < 18:
                    time_period = "afternoon"
                else:
                    time_period = "evening"
                
                for task in (t for t in session.tasks if not t.is_deleted):
                    time_stats[time_period]["total"] += 1
                    if task.completed:
                        time_stats[time_period]["completed"] += 1
        
        # Calculate completion rates
        completion_rates = {}
        for period, stats in time_stats.items():
            if stats["total"] > 0:
                completion_rates[period] = stats["completed"] / stats["total"]
            else:
                completion_rates[period] = 0.0
        
        return completion_rates
    
    @staticmethod
    def update_daily_stats(user: User, db: Session, date: datetime = None) -> None:
        """
        Update daily statistics for a user.
        """
        if date is None:
            date = datetime.now().date()
        
        # Check if stats already exist for this date
        existing_stats = db.exec(
            select(DailyStats)
            .where(DailyStats.user_id == user.id)
            .where(DailyStats.date == date)
        ).first()
        
        # Calculate stats for the day
        start_of_day = datetime.combine(date, datetime.min.time())
        end_of_day = start_of_day + timedelta(days=1)
        
        sessions = db.exec(
            select(PomodoroSession)
            .where(PomodoroSession.user_id == user.id)
            .where(PomodoroSession.completed_at >= start_of_day)
            .where(PomodoroSession.completed_at < end_of_day)
            .where(PomodoroSession.is_deleted == False)  # noqa: E712
        ).all()
        
        total_focus_time = 0
        sessions_completed = len(sessions)
        tasks_completed = 0
        tasks_total = 0
        
        for session in sessions:
            # Assuming focus_duration is in minutes
            total_focus_time += session.focus_duration
            
            for task in (t for t in session.tasks if not t.is_deleted):
                tasks_total += 1
                if task.completed:
                    tasks_completed += 1
        
        # Get feedback for productivity score
        feedbacks = db.exec(
            select(SessionFeedback)
            .where(SessionFeedback.user_id == user.id)
            .where(SessionFeedback.created_at >= start_of_day)
            .where(SessionFeedback.created_at < end_of_day)
        ).all()
        
        productivity_score = None
        if feedbacks:
            feedback_mapping = {
                "HIGHLY_DISTRACTED": 1,
                "DISTRACTED": 2,
                "NEUTRAL": 3,
                "FOCUSED": 4,
                "HIGHLY_FOCUSED": 5
            }
            scores = [feedback_mapping.get(f.focus_level, 3) for f in feedbacks]
            productivity_score = sum(scores) / len(scores)
        
        if existing_stats:
            # Update existing stats
            existing_stats.total_focus_time = total_focus_time
            existing_stats.sessions_completed = sessions_completed
            existing_stats.tasks_completed = tasks_completed
            existing_stats.productivity_score = productivity_score
            existing_stats.updated_at = datetime.now()
        else:
            # Create new stats
            new_stats = DailyStats(
                user_id=user.id,
                date=start_of_day,
                total_focus_time=total_focus_time,
                sessions_completed=sessions_completed,
                tasks_completed=tasks_completed,
                productivity_score=productivity_score
            )
            db.add(new_stats)
        
        db.commit()
