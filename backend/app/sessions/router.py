from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime

from ..db import SessionDep, get_session
from ..models import PomodoroSession, Task, Category, ActivePomodoroSession
from .schemas import (
    SessionCreate,
    SessionWithTasksPublic,
    TaskPublic,
    SessionPublic,
    SessionUpdate,
    ActiveSessionCreate,
    ActiveSessionPublic,
    ActiveSessionUpdate,
)
from sqlmodel import select
from ..auth.deps import ActiveUserDep
from ..users.models import User

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("/", response_model=SessionWithTasksPublic)
def create_session(
    db: SessionDep,
    session_data: SessionCreate,
    current_user: ActiveUserDep,
):
    db_session = PomodoroSession(
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
    return sessions


@router.post("/active", response_model=ActiveSessionPublic)
def start_active_session(
    db: SessionDep,
    session_data: ActiveSessionCreate,
    current_user: ActiveUserDep,
):
    # Check if session exists and belongs to user
    db_session = db.get(PomodoroSession, session_data.session_id)
    if not db_session or db_session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Check if user already has an active session
    existing_active = db.exec(
        select(ActivePomodoroSession).where(ActivePomodoroSession.user_id == current_user.id)
    ).first()
    
    if existing_active:
        # Update existing active session
        existing_active.session_id = session_data.session_id
        existing_active.is_running = False
        existing_active.time_remaining = db_session.focus_duration * 60  # Convert to seconds
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
    
    # Update fields if provided
    if session_update.is_running is not None:
        active_session.is_running = session_update.is_running
        if session_update.is_running:
            active_session.start_time = datetime.utcnow()
            active_session.pause_time = None
        else:
            active_session.pause_time = datetime.utcnow()
    
    if session_update.time_remaining is not None:
        active_session.time_remaining = session_update.time_remaining
    
    if session_update.phase is not None:
        active_session.phase = session_update.phase
    
    if session_update.current_task_id is not None:
        active_session.current_task_id = session_update.current_task_id
    
    if session_update.pomodoros_completed is not None:
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
    if session_update.description is not None:
        db_session.description = session_update.description
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


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
    
    return {"message": "Task completed successfully"}
