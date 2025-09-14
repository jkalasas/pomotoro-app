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
    def log_user_action(db: SessionDep, user_id: int, action: str, context: Optional[Dict[str, Any]] = None):
        """Log a user interface action"""
        event_data = {
            "action": action,
            "timestamp": datetime.utcnow().isoformat(),
            **(context or {})
        }
        return AnalyticsService.log_event(db, user_id, "user_action", event_data)
    
    @staticmethod
    def log_pomodoro_event(db: SessionDep, user_id: int, event: str, session_id: int, **kwargs):
        """Log pomodoro-specific events"""
        event_data = {
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            **kwargs
        }
        return AnalyticsService.log_event(db, user_id, f"pomodoro_{event}", event_data)
    
    @staticmethod
    def log_session_generation(db: SessionDep, user_id: int, generation_type: str, project_details: str, **kwargs):
        """Log AI session generation events"""
        event_data = {
            "generation_type": generation_type,
            "project_details": project_details,
            "timestamp": datetime.utcnow().isoformat(),
            **kwargs
        }
        return AnalyticsService.log_event(db, user_id, "session_generation", event_data)
    
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

        # If no analytics record exists yet, create one so events like task completion
        # still contribute to daily stats even if the session wasn’t explicitly started
        # via the active session endpoint.
        if not analytics:
            session = db.get(PomodoroSession, session_id)
            if not session:
                return None
            analytics = SessionAnalytics(
                user_id=session.user_id,
                session_id=session_id,
                session_started_at=datetime.utcnow(),
                total_focus_time=0,
                total_break_time=0,
                pomodoros_completed=0,
                tasks_completed=0,
                interruptions_count=0,
            )
            db.add(analytics)
            db.commit()

        # Apply provided updates to the analytics record
        # Support increment semantics via keys prefixed with "inc__"
        for key, value in kwargs.items():
            if key.startswith("inc__"):
                field = key.replace("inc__", "", 1)
                if hasattr(analytics, field):
                    current = getattr(analytics, field) or 0
                    try:
                        increment = int(value)
                    except Exception:
                        # Skip invalid increments silently
                        continue
                    setattr(analytics, field, current + increment)
                continue

            if hasattr(analytics, key):
                # For interruptions_count specifically, treat values as absolute only when higher; else preserve/increment pattern
                if key == "interruptions_count":
                    current = getattr(analytics, key) or 0
                    try:
                        incoming = int(value)
                    except Exception:
                        incoming = 0
                    setattr(analytics, key, max(current, incoming))
                else:
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
                active_tasks = [t for t in session.tasks if not getattr(t, "is_deleted", False)]
                completed_tasks = sum(1 for task in active_tasks if task.completed)
                analytics.completion_rate = (completed_tasks / len(active_tasks)) if active_tasks else None
                analytics.tasks_completed = completed_tasks
                
                # Calculate estimated vs actual ratio
                total_estimated = sum(task.estimated_completion_time for task in active_tasks if task.completed)
                total_actual = sum(task.actual_completion_time for task in active_tasks if task.completed and task.actual_completion_time)
                
                if total_estimated > 0 and total_actual > 0:
                    analytics.estimated_vs_actual_ratio = total_actual / total_estimated
            
            db.add(analytics)
            db.commit()
        
        return analytics
    
    @staticmethod
    def compute_daily_stats_for_date(db: SessionDep, user_id: int, target_date: Optional[date] = None) -> Dict[str, Any]:
        """Compute daily statistics for a user for a specific date without persisting.

        Returns a dict matching DailyStatsPublic fields (except id).
        """
        if not target_date:
            target_date = date.today()

        day_start = datetime.combine(target_date, datetime.min.time())
        day_end = datetime.combine(target_date, datetime.max.time())

        # Compute focus/break/interruptions using event timestamps so time is
        # attributed to the actual day of usage, not the day a session started.
        day_events: List[AnalyticsEvent] = db.exec(
            select(AnalyticsEvent).where(
                and_(
                    AnalyticsEvent.user_id == user_id,
                    AnalyticsEvent.created_at >= day_start,
                    AnalyticsEvent.created_at <= day_end,
                )
            )
        ).all()

        session_cfg_cache: Dict[int, PomodoroSession] = {}
        def get_session_cfg(sid: Optional[int]) -> Optional[PomodoroSession]:
            if not sid:
                return None
            if sid in session_cfg_cache:
                return session_cfg_cache[sid]
            sess = db.get(PomodoroSession, sid)
            if sess:
                session_cfg_cache[sid] = sess
            return sess

        total_focus_time = 0  # seconds across all sessions
        total_break_time = 0  # seconds across all sessions
        pomodoros_completed = 0
        interruptions_count = 0

        # Track fine-grained focus intervals per session
        from collections import defaultdict
        session_state = defaultdict(lambda: {
            "focus_active": False,
            "focus_start_time": None,
            "focus_start_remaining": None,
            "elapsed_in_pomodoro": 0,  # seconds accumulated toward current pomodoro
        })

        # Sort events chronologically
        day_events.sort(key=lambda e: e.created_at or day_start)

        for ev in day_events:
            etype = ev.event_type or ""
            try:
                data = json.loads(ev.event_data) if ev.event_data else {}
            except Exception:
                data = {}

            sid = data.get("session_id")
            if not sid:
                # Unscoped events (e.g., user_action) don't affect timing
                if etype == "timer_pause" and (data or {}).get("phase") == "focus":
                    interruptions_count += 1
                continue

            st = session_state[sid]
            cfg = get_session_cfg(sid)
            focus_duration_sec = (int(cfg.focus_duration) * 60) if (cfg and cfg.focus_duration) else 25 * 60

            if etype == "timer_start" and (data or {}).get("phase") == "focus":
                st["focus_active"] = True
                st["focus_start_time"] = ev.created_at
                st["focus_start_remaining"] = data.get("time_remaining")

            elif etype == "timer_pause" and (data or {}).get("phase") == "focus":
                interruptions_count += 1
                if st["focus_active"] and st["focus_start_time"]:
                    # Prefer remaining-time delta if available
                    pause_rem = data.get("time_remaining")
                    if (st["focus_start_remaining"] is not None) and (pause_rem is not None):
                        diff = max(0, int(st["focus_start_remaining"]) - int(pause_rem))
                        st["elapsed_in_pomodoro"] += diff
                        total_focus_time += diff
                    else:
                        # Fallback to wall-clock delta bounded by remaining in pomodoro
                        delta = int((ev.created_at - st["focus_start_time"]).total_seconds())
                        remaining = max(0, focus_duration_sec - st["elapsed_in_pomodoro"])
                        add = max(0, min(delta, remaining))
                        st["elapsed_in_pomodoro"] += add
                        total_focus_time += add
                # Pause ends active focus
                st["focus_active"] = False
                st["focus_start_time"] = None
                st["focus_start_remaining"] = None

            elif etype == "pomodoro_complete":
                # Close current pomodoro to full duration
                remaining = max(0, focus_duration_sec - st["elapsed_in_pomodoro"])
                total_focus_time += remaining
                st["elapsed_in_pomodoro"] = 0
                # Completing a pomodoro implicitly ends any active focus
                st["focus_active"] = False
                st["focus_start_time"] = None
                st["focus_start_remaining"] = None
                pomodoros_completed += 1

            elif etype == "phase_change":
                # If leaving focus without pause, close the running interval by wall-clock delta
                if (data.get("from_phase") == "focus") and st["focus_active"] and st["focus_start_time"]:
                    delta = int((ev.created_at - st["focus_start_time"]).total_seconds())
                    remaining = max(0, focus_duration_sec - st["elapsed_in_pomodoro"])
                    add = max(0, min(delta, remaining))
                    st["elapsed_in_pomodoro"] += add
                    total_focus_time += add
                    st["focus_active"] = False
                    st["focus_start_time"] = None
                    st["focus_start_remaining"] = None

            elif etype == "break_start":
                btype = data.get("break_type")
                if cfg:
                    if btype == "short_break" and cfg.short_break_duration is not None:
                        total_break_time += int(cfg.short_break_duration) * 60
                    elif btype == "long_break" and cfg.long_break_duration is not None:
                        total_break_time += int(cfg.long_break_duration) * 60

        # Close any still-active focus segments at end-of-day by wall-clock
        for sid, st in session_state.items():
            if st["focus_active"] and st["focus_start_time"]:
                cfg = get_session_cfg(sid)
                focus_duration_sec = (int(cfg.focus_duration) * 60) if (cfg and cfg.focus_duration) else 25 * 60
                delta = int((day_end - st["focus_start_time"]).total_seconds())
                remaining = max(0, focus_duration_sec - st["elapsed_in_pomodoro"])
                add = max(0, min(delta, remaining))
                total_focus_time += add

        # Fallback for historical data without events: use SessionAnalytics for that day
        if total_focus_time == 0 and pomodoros_completed == 0 and total_break_time == 0:
            session_analytics = db.exec(
                select(SessionAnalytics).where(
                    and_(
                        SessionAnalytics.user_id == user_id,
                        SessionAnalytics.session_started_at >= day_start,
                        SessionAnalytics.session_started_at <= day_end,
                    )
                )
            ).all()
            if session_analytics:
                total_focus_time = sum(sa.total_focus_time or 0 for sa in session_analytics)
                total_break_time = sum(sa.total_break_time or 0 for sa in session_analytics)
                pomodoros_completed = sum(sa.pomodoros_completed or 0 for sa in session_analytics)
                interruptions_count = sum(sa.interruptions_count or 0 for sa in session_analytics)

        # Robust sessions_completed
        completed_sessions_count = 0
        sessions_completed_flag = db.exec(
            select(PomodoroSession)
            .where(
                and_(
                    PomodoroSession.user_id == user_id,
                    PomodoroSession.completed == True,  # noqa: E712
                    PomodoroSession.completed_at != None,  # noqa: E711
                    PomodoroSession.completed_at >= day_start,
                    PomodoroSession.completed_at <= day_end,
                    PomodoroSession.is_deleted == False,  # noqa: E712
                )
            )
        ).all()
        counted_ids = {s.id for s in sessions_completed_flag}
        completed_sessions_count += len(counted_ids)

        candidate_sessions = db.exec(
            select(PomodoroSession)
            .where(
                and_(
                    PomodoroSession.user_id == user_id,
                    PomodoroSession.is_deleted == False,  # noqa: E712
                )
            )
        ).all()
        for sess in candidate_sessions:
            if sess.id in counted_ids:
                continue
            tasks = [t for t in (sess.tasks or []) if not getattr(t, "is_deleted", False)]
            if not tasks:
                continue
            if all(getattr(t, "completed", False) for t in tasks):
                completed_times = [t.completed_at for t in tasks if getattr(t, "completed_at", None) is not None]
                if completed_times:
                    latest = max(completed_times)
                    if day_start <= latest <= day_end:
                        completed_sessions_count += 1

        # Tasks completed on this day
        from ..models import Task, PomodoroSession as _PomodoroSession
        completed_tasks_today = db.exec(
            select(Task)
            .join(_PomodoroSession)
            .where(
                and_(
                    _PomodoroSession.user_id == user_id,
                    Task.completed == True,  # noqa: E712
                    Task.completed_at >= day_start,
                    Task.completed_at <= day_end,
                    Task.is_deleted == False,  # noqa: E712
                )
            )
        ).all()

        average_focus_duration = None
        if pomodoros_completed > 0:
            average_focus_duration = total_focus_time / pomodoros_completed

        return {
            "date": day_start,
            "total_focus_time": total_focus_time,
            "total_break_time": total_break_time,
            "sessions_completed": completed_sessions_count,
            "tasks_completed": len(completed_tasks_today),
            "pomodoros_completed": pomodoros_completed,
            "average_focus_duration": average_focus_duration,
            "interruptions_count": interruptions_count,
            "productivity_score": None,
        }
    
    @staticmethod
    def generate_productivity_insights(db: SessionDep, user_id: int, days: int = 30) -> ProductivityInsights:
        """Generate productivity insights for a user"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        
        # Compute daily stats for the period on-the-fly
        daily_stats = []
        current = start_date
        while current <= end_date:
            daily_stats.append(AnalyticsService.compute_daily_stats_for_date(db, user_id, current))
            current += timedelta(days=1)
        
        if not daily_stats:
            return ProductivityInsights(
                most_productive_time="No data available",
                average_session_length=0,
                completion_rate_trend="No data",
                focus_time_trend="No data",
                recommendations=["Start using the app more regularly to get insights!"]
            )
        
        # Calculate insights
        total_focus_time = sum(ds["total_focus_time"] for ds in daily_stats)
        total_sessions = sum(ds["sessions_completed"] for ds in daily_stats)
        
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
            recent_avg_focus = sum(ds["total_focus_time"] for ds in recent_stats) / len(recent_stats)
            older_avg_focus = sum(ds["total_focus_time"] for ds in older_stats) / len(older_stats)
            
            if recent_avg_focus > older_avg_focus * 1.1:
                focus_time_trend = "improving"
            elif recent_avg_focus < older_avg_focus * 0.9:
                focus_time_trend = "declining"
        
        # Generate recommendations
        recommendations = []
        avg_productivity = sum((ds.get("productivity_score") or 0) for ds in daily_stats) / len(daily_stats)
        
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
        
        # Compute daily stats on-the-fly for the range
        daily_stats = []
        current = start_date
        while current <= end_date:
            daily_stats.append(AnalyticsService.compute_daily_stats_for_date(db, user_id, current))
            current += timedelta(days=1)
        
        # Focus time trend
        focus_time_trend = [
            {
                "date": ds["date"].isoformat(),
                "focus_time": ds["total_focus_time"] / 3600,  # Convert to hours
                "break_time": ds["total_break_time"] / 3600,
            }
            for ds in daily_stats
        ]
        
        # Task completion trend
        # To ensure accuracy when sessions span days, compute completed count per day from Task.completed_at
        from ..models import Task as _Task, PomodoroSession as _PomodoroSession
        task_completion_trend = []
        current_day = start_date
        while current_day <= end_date:
            day_start = datetime.combine(current_day, datetime.min.time())
            day_end = datetime.combine(current_day, datetime.max.time())
            completed_count = db.exec(
                select(_Task)
                .join(_PomodoroSession)
                .where(
                    and_(
                        _PomodoroSession.user_id == user_id,
                        _Task.completed == True,  # noqa: E712
                        _Task.completed_at >= day_start,
                        _Task.completed_at <= day_end,
                        _Task.is_deleted == False  # noqa: E712
                    )
                )
            ).all()

            # sessions_completed from computed daily_stats for this date
            ds_for_day = next((ds for ds in daily_stats if ds["date"].date() == current_day), None)
            sessions_count = ds_for_day["sessions_completed"] if ds_for_day else 0

            task_completion_trend.append({
                "date": current_day.isoformat(),
                "completed": len(completed_count),
                "sessions": sessions_count
            })

            current_day += timedelta(days=1)
        
        # Productivity heatmap (simplified - could be enhanced)
        productivity_heatmap = [
            {
                "date": ds["date"].isoformat(),
                "productivity": ds.get("productivity_score") or 0,
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
