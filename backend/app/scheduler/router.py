from fastapi import APIRouter, HTTPException
from typing import List
from sqlmodel import select

from ..auth.deps import ActiveUserDep
from ..db import SessionDep
from ..models import PomodoroSession, Task
from .schemas import (
    ScheduleRequest,
    ScheduleResponse,
    ScheduledTaskResponse,
    ScheduleReorderRequest,
)
from .genetic_scheduler import GeneticScheduler

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])


def schedule_tasks_with_ga(session_ids: List[int], db, user: ActiveUserDep) -> ScheduleResponse:
    """
    Schedule tasks using the GA (PyGAD-based) that preserves in-session order.
    """
    # Get all non-completed, non-archived tasks for the specified sessions
    statement = select(Task).where(
        Task.session_id.in_(session_ids),
        Task.completed == False,
        Task.archived == False,
        Task.is_deleted == False  # noqa: E712
    )
    all_tasks = db.exec(statement).all()

    if not all_tasks:
        raise HTTPException(status_code=404, detail="No uncompleted tasks found for the provided session IDs.")

    scheduler = GeneticScheduler()
    optimized, fitness = scheduler.schedule_tasks(all_tasks, user, db)

    response_tasks = [
        ScheduledTaskResponse(
            id=t.id,
            name=t.name,
            estimated_completion_time=t.estimated_completion_time,
            session_id=t.session_id,
            category=(t.categories[0].name if t.categories else "Uncategorized"),
            due_date=t.due_date.isoformat() if t.due_date else None,
            completed=t.completed,
        )
        for t in optimized
    ]
    total_time = sum(t.estimated_completion_time for t in optimized)
    return ScheduleResponse(scheduled_tasks=response_tasks, total_schedule_time=total_time, fitness_score=fitness)


@router.post("/generate-schedule", response_model=ScheduleResponse)
def generate_schedule(request: ScheduleRequest, db: SessionDep, user: ActiveUserDep):
    """
    Generate an optimized task schedule using genetic algorithm
    """
    # Verify user owns all requested sessions
    query = select(PomodoroSession).where(
        PomodoroSession.id.in_(request.session_ids),
        PomodoroSession.user_id != user.id,
        PomodoroSession.is_deleted == False  # noqa: E712
    )

    unauthorized_sessions = db.exec(query).first()
    if unauthorized_sessions:
        raise HTTPException(
            status_code=403,
            detail="Cannot schedule tasks from sessions not owned by the user.",
        )

    if not request.session_ids:
        raise HTTPException(status_code=400, detail="Session IDs list cannot be empty.")
    
    return schedule_tasks_with_ga(request.session_ids, db, user)


    


@router.put("/reorder-schedule", response_model=ScheduleResponse)
def reorder_schedule(
    request: ScheduleReorderRequest, 
    db: SessionDep, 
    user: ActiveUserDep
):
    """
    Reorder the current generated schedule based on user preference.
    This allows users to manually adjust the AI-generated optimal schedule.
    """
    try:
        # Get all tasks by their IDs and verify they belong to user sessions
        tasks = []
        for task_id in request.task_ids:
            task = db.get(Task, task_id)
            if not task:
                raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
            
            # Verify the task belongs to a session owned by the user
            session = db.get(PomodoroSession, task.session_id)
            if not session or session.user_id != user.id:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Task {task_id} does not belong to user sessions"
                )
            tasks.append(task)
        
        # Convert to ScheduledTaskResponse format maintaining the requested order
        scheduled_tasks = []
        total_time = 0
        
        for task in tasks:
            # Get category name
            category_name = "Uncategorized"
            if task.categories:
                category_name = task.categories[0].name
                
            scheduled_task = ScheduledTaskResponse(
                id=task.id,
                name=task.name,
                estimated_completion_time=task.estimated_completion_time,
                session_id=task.session_id,
                category=category_name,
                due_date=task.due_date.isoformat() if task.due_date else None,
                completed=task.completed
            )
            scheduled_tasks.append(scheduled_task)
            total_time += task.estimated_completion_time
        
        # Return the reordered schedule with a default fitness score
        # In a more sophisticated implementation, you could recalculate fitness
        return ScheduleResponse(
            scheduled_tasks=scheduled_tasks,
            total_schedule_time=total_time,
            fitness_score=0.0  # User-modified schedules get neutral score
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reordering schedule: {str(e)}")
