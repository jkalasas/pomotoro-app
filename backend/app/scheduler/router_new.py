from fastapi import APIRouter, HTTPException
from typing import List, Dict
from sqlmodel import select

from ..auth.deps import ActiveUserDep
from ..db import SessionDep
from ..models import PomodoroSession, Task
from .schemas import ScheduleRequest, ScheduleResponse, ScheduledTaskResponse
from .genetic_algorithm import GeneticAlgorithmScheduler

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])


def schedule_tasks_with_ga(session_ids: List[int], db: SessionDep, user: ActiveUserDep) -> ScheduleResponse:
    """
    Schedule tasks using the Genetic Algorithm implementation from IMPLEMENTATION.md
    """
    # Get all tasks for the specified sessions
    statement = select(Task).where(Task.session_id.in_(session_ids))
    all_tasks = db.exec(statement).all()
    
    if not all_tasks:
        raise HTTPException(
            status_code=404, detail="No tasks found for the provided session IDs."
        )

    # Group tasks by session for validation
    tasks_by_session: Dict[int, List[Task]] = {}
    for task in all_tasks:
        tasks_by_session.setdefault(task.session_id, []).append(task)

    # Convert to list for GA processing
    task_list = list(all_tasks)
    
    # Initialize and run genetic algorithm
    ga_scheduler = GeneticAlgorithmScheduler(
        population_size=50,
        num_generations=100,
        tournament_size=5,
        crossover_probability=0.8,
        mutation_probability=0.1,
        elitism_count=5
    )
    
    # Get the optimized schedule
    optimized_schedule, fitness_score = ga_scheduler.schedule_tasks(task_list, user, db)
    
    # Convert to response format
    response_tasks = [
        ScheduledTaskResponse(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            session_id=task.session_id,
            category=task.categories[0].name if task.categories else "Uncategorized",
            due_date=task.due_date.isoformat() if task.due_date else None,
            completed=task.completed
        )
        for task in optimized_schedule
    ]
    
    total_time = sum(task.estimated_completion_time for task in optimized_schedule)
    
    return ScheduleResponse(
        scheduled_tasks=response_tasks, 
        total_schedule_time=total_time,
        fitness_score=fitness_score
    )


@router.post("/generate-schedule", response_model=ScheduleResponse)
def generate_schedule(request: ScheduleRequest, db: SessionDep, user: ActiveUserDep):
    """
    Generate an optimized task schedule using genetic algorithm
    """
    # Verify user owns all requested sessions
    query = (
        select(PomodoroSession)
        .where(PomodoroSession.id.in_(request.session_ids))
        .where(PomodoroSession.user_id != user.id)
        .exists()
    )

    if db.exec(query).first():
        raise HTTPException(
            status_code=403,
            detail="Cannot schedule tasks from sessions not owned by the user.",
        )

    if not request.session_ids:
        raise HTTPException(status_code=400, detail="Session IDs list cannot be empty.")
    
    return schedule_tasks_with_ga(request.session_ids, db, user)
