from fastapi import APIRouter, Depends, HTTPException
from typing import List

from ..db import get_session
from ..models import PomodoroSession, Task, Category
from .schemas import (
    SessionCreate,
    SessionWithTasksPublic,
    TaskPublic,
    SessionPublic,
    SessionUpdate,
)
from sqlmodel import select

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("/", response_model=SessionWithTasksPublic)
def create_session(session_data: SessionCreate, db=Depends(get_session)):
    db_session = PomodoroSession(
        description=session_data.description,
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
def read_sessions(db=Depends(get_session)):
    sessions = db.exec(select(PomodoroSession)).all()
    return sessions


@router.get("/{session_id}", response_model=SessionWithTasksPublic)
def read_session(session_id: int, db=Depends(get_session)):
    db_session = db.get(PomodoroSession, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    tasks_public = [
        TaskPublic(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            category=task.categories[0].name if task.categories else "Uncategorized",
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
    session_id: int, session_update: SessionUpdate, db=Depends(get_session)
):
    db_session = db.get(PomodoroSession, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session_update.description is not None:
        db_session.description = session_update.description
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@router.delete("/{session_id}", response_model=dict)
def delete_session(session_id: int, db=Depends(get_session)):
    db_session = db.get(PomodoroSession, session_id)
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(db_session)
    db.commit()
    return {"message": "Session deleted successfully"}
