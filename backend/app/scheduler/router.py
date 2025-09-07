from fastapi import APIRouter, HTTPException
from typing import List, Dict
from sqlmodel import select

from ..auth.deps import ActiveUserDep
from ..db import SessionDep
from ..models import PomodoroSession, Task
from .schemas import ScheduleRequest, ScheduleResponse, ScheduledTaskResponse, UserAnalyticsResponse, ScheduleReorderRequest
from .genetic_algorithm import GeneticAlgorithmScheduler
from ..services.analytics import UserAnalyticsService

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])


def schedule_tasks_with_ga(session_ids: List[int], db, user: ActiveUserDep) -> ScheduleResponse:
    """
    Schedule tasks using the Genetic Algorithm implementation from IMPLEMENTATION.md
    """
    # Get all non-completed, non-archived tasks for the specified sessions
    statement = select(Task).where(
        Task.session_id.in_(session_ids),
        Task.completed == False,
        Task.archived == False
    )
    all_tasks = db.exec(statement).all()
    
    if not all_tasks:
        raise HTTPException(
            status_code=404, detail="No uncompleted tasks found for the provided session IDs."
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
            category="",  # Empty since we're showing session names instead
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
    query = select(PomodoroSession).where(
        PomodoroSession.id.in_(request.session_ids),
        PomodoroSession.user_id != user.id
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


@router.get("/user-insights", response_model=UserAnalyticsResponse)
def get_user_insights(db: SessionDep, user: ActiveUserDep):
    """
    Get user analytics insights for the genetic algorithm scheduler.
    """
    try:
        completion_rate = UserAnalyticsService.calculate_completion_rate(user, db)
        focus_level = UserAnalyticsService.calculate_average_focus_level(user, db)
        time_ratio = UserAnalyticsService.calculate_estimated_vs_actual_ratio(user, db)
        category_performance = UserAnalyticsService.get_task_category_performance(user, db)
        time_of_day_performance = UserAnalyticsService.get_time_of_day_performance(user, db)
        
        return UserAnalyticsResponse(
            completion_rate=completion_rate,
            average_focus_level=focus_level,
            estimated_vs_actual_ratio=time_ratio,
            category_performance=category_performance,
            time_of_day_performance=time_of_day_performance
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating user insights: {str(e)}")


@router.post("/update-daily-stats")
def update_daily_stats(db: SessionDep, user: ActiveUserDep):
    """
    Update daily statistics for the current user.
    """
    try:
        UserAnalyticsService.update_daily_stats(user, db)
        return {"message": "Daily statistics updated successfully"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating daily stats: {str(e)}")


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
