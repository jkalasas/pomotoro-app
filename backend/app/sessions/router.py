from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime

from ..db import SessionDep, get_session
from ..models import PomodoroSession, Task, Category, ActivePomodoroSession, SessionFeedback
from .schemas import (
    SessionCreate,
    SessionWithTasksPublic,
    TaskPublic,
    SessionPublic,
    SessionUpdate,
    ActiveSessionCreate,
    ActiveSessionPublic,
    ActiveSessionUpdate,
    SessionFeedbackCreate,
    SessionFeedbackPublic,
    SessionCompleteRequest,
    FocusLevel,
)
from sqlmodel import select
from ..auth.deps import ActiveUserDep
from ..users.models import User
from ..analytics.service import AnalyticsService

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("/", response_model=SessionWithTasksPublic)
def create_session(
    db: SessionDep,
    session_data: SessionCreate,
    current_user: ActiveUserDep,
):
    # Generate a name if not provided
    session_name = session_data.name
    if not session_name:
        # Generate a name based on the description and tasks
        task_names = [task.name for task in session_data.tasks]
        prompt = f"Generate a concise, descriptive name for a Pomodoro session with description: '{session_data.description}' and tasks: {', '.join(task_names)}. Keep it under 50 characters."
        
        try:
            import google.generativeai as genai
            from ..config import settings
            
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel('gemini-pro')
            response = model.generate_content(prompt)
            session_name = response.text.strip().strip('"').strip("'")[:50]
        except Exception as e:
            print(f"Failed to generate session name: {e}")
            # Fallback to a generic name
            session_name = f"Session {len(session_data.tasks)} tasks"
    
    db_session = PomodoroSession(
        name=session_name,
        description=session_data.description,
        user_id=current_user.id,
        **session_data.pomodoro_config.model_dump()
    )

    for task_data in session_data.tasks:
        category = db.exec(
            select(Category).where(Category.name == task_data.category)
        ).first()
        if not category:
            category = Category(name=task_data.category)
            db.add(category)
            db.commit()
            db.refresh(category)

        db_task = Task(
            name=task_data.name,
            estimated_completion_time=task_data.estimated_completion_time,
            categories=[category],
            session=db_session,
        )
        db.add(db_task)

    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    tasks_public = [
        TaskPublic(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            category=task.categories[0].name if task.categories else "Uncategorized",
            completed=task.completed,
            actual_completion_time=task.actual_completion_time,
        )
        for task in db_session.tasks
    ]

    return SessionWithTasksPublic(
        id=db_session.id,
        name=db_session.name,
        description=db_session.description,
        focus_duration=db_session.focus_duration,
        short_break_duration=db_session.short_break_duration,
        long_break_duration=db_session.long_break_duration,
        long_break_per_pomodoros=db_session.long_break_per_pomodoros,
        tasks=tasks_public,
    )


@router.get("/", response_model=List[SessionPublic])
def read_sessions(
    db: SessionDep,
    current_user: ActiveUserDep,
):
    sessions = db.exec(
        select(PomodoroSession).where(PomodoroSession.user_id == current_user.id)
    ).all()
    
    # Convert to SessionPublic format to ensure all fields are included
    return [
        SessionPublic(
            id=session.id,
            name=session.name,
            description=session.description,
            focus_duration=session.focus_duration,
            short_break_duration=session.short_break_duration,
            long_break_duration=session.long_break_duration,
            long_break_per_pomodoros=session.long_break_per_pomodoros,
        )
        for session in sessions
    ]


@router.post("/active", response_model=ActiveSessionPublic)
def start_active_session(
    db: SessionDep,
    session_data: ActiveSessionCreate,
    current_user: ActiveUserDep,
):
    # Get the session to validate it belongs to the user
    db_session = db.get(PomodoroSession, session_data.session_id)
    if not db_session or db_session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Prevent starting completed sessions
    if db_session.completed:
        raise HTTPException(status_code=400, detail="Cannot start a completed session")

    # Check if there's already an active session
    existing_active = db.exec(
        select(ActivePomodoroSession).where(ActivePomodoroSession.user_id == current_user.id)
    ).first()
    
    if existing_active:
        # Log session switch analytics event
        AnalyticsService.log_event(
            db=db,
            user_id=current_user.id,
            event_type="session_switch",
            event_data={
                "from_session_id": existing_active.session_id,
                "to_session_id": session_data.session_id,
                "switch_time": datetime.utcnow().isoformat()
            }
        )
        
        # End analytics for previous session
        AnalyticsService.end_session_analytics(db=db, session_id=existing_active.session_id)
        
        # Update existing active session
        existing_active.session_id = session_data.session_id
        existing_active.is_running = False
        existing_active.time_remaining = db_session.focus_duration * 60
        existing_active.phase = "focus"
        existing_active.pomodoros_completed = 0
        existing_active.current_task_id = db_session.tasks[0].id if db_session.tasks else None
        db.add(existing_active)
    else:
        # Create new active session
        active_session = ActivePomodoroSession(
            user_id=current_user.id,
            session_id=session_data.session_id,
            is_running=False,
            time_remaining=db_session.focus_duration * 60,
            phase="focus",
            pomodoros_completed=0,
            current_task_id=db_session.tasks[0].id if db_session.tasks else None,
        )
        db.add(active_session)
    
    # Start analytics tracking for new session
    AnalyticsService.start_session_analytics(
        db=db,
        user_id=current_user.id,
        session_id=session_data.session_id
    )
    
    # Log session start event
    AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type="session_start",
        event_data={
            "session_id": session_data.session_id,
            "session_name": db_session.name,
            "start_time": datetime.utcnow().isoformat()
        }
    )
    
    db.commit()
    db.refresh(existing_active if existing_active else active_session)
    
    return ActiveSessionPublic(
        id=(existing_active if existing_active else active_session).id,
        session_id=session_data.session_id,
        current_task_id=(existing_active if existing_active else active_session).current_task_id,
        is_running=False,
        time_remaining=(existing_active if existing_active else active_session).time_remaining,
        phase="focus",
        pomodoros_completed=0,
    )


@router.get("/active", response_model=ActiveSessionPublic)
def get_active_session(
    db: SessionDep,
    current_user: ActiveUserDep,
):
    active_session = db.exec(
        select(ActivePomodoroSession).where(ActivePomodoroSession.user_id == current_user.id)
    ).first()
    
    if not active_session:
        raise HTTPException(status_code=404, detail="No active session found")
    
    return ActiveSessionPublic(
        id=active_session.id,
        session_id=active_session.session_id,
        current_task_id=active_session.current_task_id,
        is_running=active_session.is_running,
        time_remaining=active_session.time_remaining,
        phase=active_session.phase,
        pomodoros_completed=active_session.pomodoros_completed,
    )


@router.put("/active", response_model=ActiveSessionPublic)
def update_active_session(
    db: SessionDep,
    session_update: ActiveSessionUpdate,
    current_user: ActiveUserDep,
):
    active_session = db.exec(
        select(ActivePomodoroSession).where(ActivePomodoroSession.user_id == current_user.id)
    ).first()
    
    if not active_session:
        raise HTTPException(status_code=404, detail="No active session found")
    
    # Track previous state for analytics
    previous_running = active_session.is_running
    previous_phase = active_session.phase
    
    # Update fields if provided
    if session_update.is_running is not None:
        active_session.is_running = session_update.is_running
        if session_update.is_running:
            active_session.start_time = datetime.utcnow()
            active_session.pause_time = None
            
            # Log timer start event
            AnalyticsService.log_event(
                db=db,
                user_id=current_user.id,
                event_type="timer_start",
                event_data={
                    "session_id": active_session.session_id,
                    "phase": active_session.phase,
                    "time_remaining": active_session.time_remaining
                }
            )
        else:
            active_session.pause_time = datetime.utcnow()
            
            # Log timer pause event
            AnalyticsService.log_event(
                db=db,
                user_id=current_user.id,
                event_type="timer_pause",
                event_data={
                    "session_id": active_session.session_id,
                    "phase": active_session.phase,
                    "time_remaining": active_session.time_remaining
                }
            )
            
            # Update interruptions count if pausing during focus
            if active_session.phase == "focus":
                AnalyticsService.update_session_analytics(
                    db=db,
                    session_id=active_session.session_id,
                    interruptions_count=1  # This would need to be incremented properly
                )

    if session_update.time_remaining is not None:
        active_session.time_remaining = session_update.time_remaining

    if session_update.phase is not None:
        # Log phase change
        if previous_phase != session_update.phase:
            AnalyticsService.log_event(
                db=db,
                user_id=current_user.id,
                event_type="phase_change",
                event_data={
                    "session_id": active_session.session_id,
                    "from_phase": previous_phase,
                    "to_phase": session_update.phase,
                    "change_time": datetime.utcnow().isoformat()
                }
            )
            
            # If switching to break, log break start
            if session_update.phase in ["short_break", "long_break"]:
                AnalyticsService.log_event(
                    db=db,
                    user_id=current_user.id,
                    event_type="break_start",
                    event_data={
                        "session_id": active_session.session_id,
                        "break_type": session_update.phase,
                        "start_time": datetime.utcnow().isoformat()
                    }
                )
        
        active_session.phase = session_update.phase

    if session_update.current_task_id is not None:
        # Log task switch if different
        if active_session.current_task_id != session_update.current_task_id:
            AnalyticsService.log_event(
                db=db,
                user_id=current_user.id,
                event_type="task_switch",
                event_data={
                    "session_id": active_session.session_id,
                    "from_task_id": active_session.current_task_id,
                    "to_task_id": session_update.current_task_id,
                    "switch_time": datetime.utcnow().isoformat()
                }
            )
        
        active_session.current_task_id = session_update.current_task_id

    if session_update.pomodoros_completed is not None:
        # Log pomodoro completion if increased
        if session_update.pomodoros_completed > active_session.pomodoros_completed:
            AnalyticsService.log_event(
                db=db,
                user_id=current_user.id,
                event_type="pomodoro_complete",
                event_data={
                    "session_id": active_session.session_id,
                    "pomodoros_completed": session_update.pomodoros_completed,
                    "completion_time": datetime.utcnow().isoformat()
                }
            )
            
            # Update session analytics
            AnalyticsService.update_session_analytics(
                db=db,
                session_id=active_session.session_id,
                pomodoros_completed=session_update.pomodoros_completed
            )
        
        active_session.pomodoros_completed = session_update.pomodoros_completed

    db.add(active_session)
    db.commit()
    db.refresh(active_session)

    return ActiveSessionPublic(
        id=active_session.id,
        session_id=active_session.session_id,
        current_task_id=active_session.current_task_id,
        is_running=active_session.is_running,
        time_remaining=active_session.time_remaining,
        phase=active_session.phase,
        pomodoros_completed=active_session.pomodoros_completed,
    )


@router.delete("/active", response_model=dict)
def stop_active_session(
    db: SessionDep,
    current_user: ActiveUserDep,
):
    active_session = db.exec(
        select(ActivePomodoroSession).where(ActivePomodoroSession.user_id == current_user.id)
    ).first()
    
    if not active_session:
        raise HTTPException(status_code=404, detail="No active session found")
    
    db.delete(active_session)
    db.commit()
    
    return {"message": "Active session stopped successfully"}


@router.get("/daily-progress", response_model=dict)
def get_daily_progress(
    current_user: ActiveUserDep,
    db: SessionDep
):
    """Get daily progress for the current user."""
    from datetime import date, datetime, time
    
    # Get today's date range
    today = date.today()
    today_start = datetime.combine(today, time.min)
    today_end = datetime.combine(today, time.max)
    
    # 1. Count completed tasks today
    completed_tasks_query = select(Task).where(
        Task.completed == True,
        Task.completed_at >= today_start,
        Task.completed_at <= today_end
    )
    
    # Get tasks that belong to user's sessions
    user_sessions = select(PomodoroSession.id).where(PomodoroSession.user_id == current_user.id)
    completed_tasks_query = completed_tasks_query.where(Task.session_id.in_(user_sessions))
    
    completed_tasks_result = db.exec(completed_tasks_query)
    completed_tasks = len(list(completed_tasks_result))
    
    # 2. Count completed sessions today
    # A session is considered completed if all its tasks are completed
    # and the last task was completed today
    completed_sessions = 0
    
    # Get all user's sessions
    user_sessions_query = select(PomodoroSession).where(PomodoroSession.user_id == current_user.id)
    user_sessions_result = db.exec(user_sessions_query)
    
    for session in user_sessions_result:
        # Get all tasks for this session
        session_tasks_query = select(Task).where(Task.session_id == session.id)
        session_tasks = list(db.exec(session_tasks_query))
        
        if not session_tasks:
            continue
            
        # Check if all tasks are completed
        all_completed = all(task.completed for task in session_tasks)
        
        if all_completed:
            # Check if the last completed task was today
            completed_tasks_today = [
                task for task in session_tasks 
                if task.completed_at and today_start <= task.completed_at <= today_end
            ]
            
            if completed_tasks_today:
                # Find the most recent completion time
                latest_completion = max(task.completed_at for task in completed_tasks_today)
                if today_start <= latest_completion <= today_end:
                    completed_sessions += 1
    
    # 3. Calculate rest time (estimate based on completed pomodoros)
    # For each completed task, assume some break time
    # This is a rough estimate - in a real app, you'd track actual break times
    rest_time_minutes = completed_tasks * 5  # 5 minutes break per completed task
    
    # 4. Daily goal sessions (hardcoded for now, could be made configurable)
    daily_goal_sessions = 8
    
    # 5. Today's date
    date_str = today.isoformat()
    
    return {
        "rest_time_minutes": rest_time_minutes,
        "daily_goal_sessions": daily_goal_sessions,
        "completed_tasks": completed_tasks,
        "completed_sessions": completed_sessions,
        "date": date_str
    }


@router.get("/{session_id}", response_model=SessionWithTasksPublic)
def read_session(
    db: SessionDep,
    session_id: int,
    current_user: ActiveUserDep,
):
    db_session = db.get(PomodoroSession, session_id)
    if not db_session or db_session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks_public = [
        TaskPublic(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            category=task.categories[0].name if task.categories else "Uncategorized",
            completed=task.completed,
            actual_completion_time=task.actual_completion_time,
        )
        for task in db_session.tasks
    ]

    return SessionWithTasksPublic(
        id=db_session.id,
        name=db_session.name,
        description=db_session.description,
        focus_duration=db_session.focus_duration,
        short_break_duration=db_session.short_break_duration,
        long_break_duration=db_session.long_break_duration,
        long_break_per_pomodoros=db_session.long_break_per_pomodoros,
        tasks=tasks_public,
    )


@router.put("/{session_id}", response_model=SessionPublic)
def update_session(
    db: SessionDep,
    session_id: int,
    session_update: SessionUpdate,
    current_user: ActiveUserDep,
):
    db_session = db.get(PomodoroSession, session_id)
    if not db_session or db_session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if there's an active session running for this session
    active_session = db.exec(
        select(ActivePomodoroSession).where(
            ActivePomodoroSession.session_id == session_id,
            ActivePomodoroSession.user_id == current_user.id
        )
    ).first()
    
    if active_session and active_session.is_running:
        raise HTTPException(
            status_code=400, 
            detail="Cannot update session configuration while session is running"
        )
    
    # Update fields if provided
    if session_update.description is not None:
        db_session.description = session_update.description
    if session_update.name is not None:
        db_session.name = session_update.name
    if session_update.focus_duration is not None:
        db_session.focus_duration = session_update.focus_duration
    if session_update.short_break_duration is not None:
        db_session.short_break_duration = session_update.short_break_duration
    if session_update.long_break_duration is not None:
        db_session.long_break_duration = session_update.long_break_duration
    if session_update.long_break_per_pomodoros is not None:
        db_session.long_break_per_pomodoros = session_update.long_break_per_pomodoros
    
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    
    # Update active session timing if one exists and timing values were changed
    timing_changed = any([
        session_update.focus_duration is not None,
        session_update.short_break_duration is not None,
        session_update.long_break_duration is not None,
        session_update.long_break_per_pomodoros is not None
    ])
    
    if timing_changed and active_session and not active_session.is_running:
        # Update the time_remaining based on current phase and new timings
        if active_session.phase == "focus":
            active_session.time_remaining = db_session.focus_duration * 60
        elif active_session.phase == "short_break":
            active_session.time_remaining = db_session.short_break_duration * 60
        elif active_session.phase == "long_break":
            active_session.time_remaining = db_session.long_break_duration * 60
        
        db.add(active_session)
        db.commit()
        db.refresh(active_session)
    
    # Return in SessionPublic format to ensure consistency
    return SessionPublic(
        id=db_session.id,
        name=db_session.name,
        description=db_session.description,
        focus_duration=db_session.focus_duration,
        short_break_duration=db_session.short_break_duration,
        long_break_duration=db_session.long_break_duration,
        long_break_per_pomodoros=db_session.long_break_per_pomodoros,
    )


@router.delete("/{session_id}", response_model=dict)
def delete_session(
    db: SessionDep,
    session_id: int,
    current_user: ActiveUserDep,
):
    db_session = db.get(PomodoroSession, session_id)
    if not db_session or db_session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(db_session)
    db.commit()
    return {"message": "Session deleted successfully"}


@router.put("/tasks/{task_id}/complete", response_model=dict)
def complete_task(
    db: SessionDep,
    task_id: int,
    current_user: ActiveUserDep,
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if task belongs to user's session
    if task.session and task.session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this task")
    
    task.completed = True
    task.completed_at = datetime.utcnow()
    # For now, set actual_completion_time to estimated if not set
    if task.actual_completion_time is None:
        task.actual_completion_time = task.estimated_completion_time
    
    db.add(task)
    db.commit()
    
    # Log task completion analytics event
    AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type="task_complete",
        event_data={
            "task_id": task_id,
            "task_name": task.name,
            "session_id": task.session_id,
            "estimated_time": task.estimated_completion_time,
            "actual_time": task.actual_completion_time,
            "completion_time": task.completed_at.isoformat()
        }
    )
    
    # Update session analytics if available
    if task.session_id:
        AnalyticsService.update_session_analytics(
            db=db,
            session_id=task.session_id,
            tasks_completed=len([t for t in task.session.tasks if t.completed])
        )
    
    return {"message": "Task completed successfully"}


@router.put("/tasks/{task_id}/uncomplete", response_model=dict)
def uncomplete_task(
    db: SessionDep,
    task_id: int,
    current_user: ActiveUserDep,
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if task belongs to user's session
    if task.session and task.session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this task")
    
    # Get the session to check if it's completed
    session = task.session
    was_session_completed = session.completed if session else False
    
    # Mark task as incomplete
    task.completed = False
    task.completed_at = None
    task.actual_completion_time = None
    
    db.add(task)
    
    # If session was completed, reset it when task is uncompleted
    if was_session_completed and session:
        session.completed = False
        session.completed_at = None
        db.add(session)
        
        # Log session reset analytics event
        AnalyticsService.log_event(
            db=db,
            user_id=current_user.id,
            event_type="session_reset",
            event_data={
                "session_id": session.id,
                "trigger_task_id": task_id,
                "trigger_task_name": task.name,
                "reason": "task_uncompleted",
                "reset_time": datetime.utcnow().isoformat()
            }
        )
    
    db.commit()
    
    # Log task uncompletion analytics event
    AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type="task_uncomplete",
        event_data={
            "task_id": task_id,
            "task_name": task.name,
            "session_id": task.session_id,
            "session_was_completed": was_session_completed,
            "session_reset": was_session_completed
        }
    )
    
    # Update session analytics if available
    if task.session_id:
        AnalyticsService.update_session_analytics(
            db=db,
            session_id=task.session_id,
            tasks_completed=len([t for t in task.session.tasks if t.completed])
        )
    
    return {"message": "Task uncompleted successfully", "session_reset": was_session_completed}


@router.post("/{session_id}/complete", response_model=SessionFeedbackPublic)
def complete_session(
    session_id: int,
    feedback_data: SessionCompleteRequest,
    db: SessionDep,
    current_user: ActiveUserDep,
):
    """Complete a session and submit feedback"""
    
    # Get the session
    session = db.exec(
        select(PomodoroSession)
        .where(PomodoroSession.id == session_id)
        .where(PomodoroSession.user_id == current_user.id)
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.completed:
        raise HTTPException(status_code=400, detail="Session already completed")
    
    # Mark session as completed
    session.completed = True
    session.completed_at = datetime.utcnow()
    
    # Mark ALL tasks as completed when session is completed
    incomplete_tasks = []
    for task in session.tasks:
        if not task.completed:
            task.completed = True
            task.completed_at = datetime.utcnow()
            incomplete_tasks.append(task.id)
    
    # Log which tasks were auto-completed
    if incomplete_tasks:
        AnalyticsService.log_event(
            db=db,
            user_id=current_user.id,
            event_type="tasks_auto_completed",
            event_data={
                "session_id": session_id,
                "auto_completed_task_ids": incomplete_tasks,
                "reason": "session_completion"
            }
        )
    
    # Calculate session statistics (all tasks are now completed)
    completed_tasks = len(session.tasks)
    failed_tasks = 0  # No failed tasks since we completed all
    total_focus_time = sum(task.actual_completion_time or 0 for task in session.tasks if task.completed)
    focus_duration_minutes = total_focus_time // 60
    
    # Create feedback record
    feedback = SessionFeedback(
        session_id=session_id,
        user_id=current_user.id,
        focus_level=feedback_data.focus_level.value,
        session_reflection=feedback_data.session_reflection,
        tasks_completed=completed_tasks,
        tasks_failed=failed_tasks,
        focus_duration_minutes=focus_duration_minutes,
    )
    
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    
    # Log analytics event for session completion
    AnalyticsService.log_event(
        db=db,
        user_id=current_user.id,
        event_type="session_complete",
        event_data={
            "session_id": session_id,
            "focus_level": feedback_data.focus_level.value,
            "tasks_completed": completed_tasks,
            "tasks_failed": failed_tasks,
            "focus_duration_minutes": focus_duration_minutes,
        }
    )
    
    # Update session analytics
    AnalyticsService.update_session_analytics(
        db=db,
        session_id=session_id,
        tasks_completed=completed_tasks,
        session_ended_at=session.completed_at
    )
    
    return SessionFeedbackPublic(
        id=feedback.id,
        session_id=feedback.session_id,
        focus_level=feedback.focus_level,
        session_reflection=feedback.session_reflection,
        tasks_completed=feedback.tasks_completed,
        tasks_failed=feedback.tasks_failed,
        focus_duration_minutes=feedback.focus_duration_minutes,
        created_at=feedback.created_at,
    )


@router.get("/feedback", response_model=List[SessionFeedbackPublic])
def get_session_feedbacks(
    db: SessionDep,
    current_user: ActiveUserDep,
    limit: int = 50,
):
    """Get session feedback history for the current user"""
    
    feedbacks = db.exec(
        select(SessionFeedback)
        .where(SessionFeedback.user_id == current_user.id)
        .order_by(SessionFeedback.created_at.desc())
        .limit(limit)
    ).all()
    
    return [
        SessionFeedbackPublic(
            id=feedback.id,
            session_id=feedback.session_id,
            focus_level=feedback.focus_level,
            session_reflection=feedback.session_reflection,
            tasks_completed=feedback.tasks_completed,
            tasks_failed=feedback.tasks_failed,
            focus_duration_minutes=feedback.focus_duration_minutes,
            created_at=feedback.created_at,
        )
        for feedback in feedbacks
    ]
