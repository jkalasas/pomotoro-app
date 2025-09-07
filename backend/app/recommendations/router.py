import statistics
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth.deps import ActiveUserDep
from ..services.llm import call_gemini_for_tasks
from ..db import SessionDep
from ..models import Category, Task, TaskCategoryLink, PomodoroSession
from .schemas import (
    SessionDescriptionRequest,
    RecommendationResponse,
    TaskResponse,
    PomodoroConfig,
    SessionInfo,
)
from .genetic import GeneticScheduler

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


async def get_recommendations(description: str, db: Session) -> RecommendationResponse:
    llm_output = await call_gemini_for_tasks(description)

    class LlmTask(BaseModel):
        name: str
        category: str
        estimated_completion_time: int

    initial_tasks = [LlmTask(**task) for task in llm_output.get("tasks", [])]
    pomodoro_config = PomodoroConfig(**llm_output.get("pomodoro_setup", {}))
    session_info = SessionInfo(**llm_output.get("session", {"name": "Generated Session", "description": description}))

    final_tasks: List[TaskResponse] = []
    total_time = 0
    SIMILARITY_THRESHOLD = 2

    for task in initial_tasks:
        category_obj = db.exec(
            select(Category).where(Category.name == task.category)
        ).first()
        if not category_obj:
            category_obj = Category(name=task.category)
            db.add(category_obj)
            db.commit()
            db.refresh(category_obj)

        statement = (
            select(Task.actual_completion_time)
            .join(TaskCategoryLink, Task.id == TaskCategoryLink.task_id)
            .join(Category, Category.id == TaskCategoryLink.category_id)
            .where(Category.name == task.category)
            .where(Task.name.ilike(f"%{task.name}%"))
            .where(Task.actual_completion_time != None)
        )
        results = db.exec(statement).all()

        final_estimate = task.estimated_completion_time
        if len(results) >= SIMILARITY_THRESHOLD:
            final_estimate = round(statistics.mean(results))

        final_tasks.append(
            TaskResponse(
                name=task.name,
                category=task.category,
                estimated_completion_time=final_estimate,
            )
        )
        total_time += final_estimate

    return RecommendationResponse(
        session=session_info,
        generated_tasks=final_tasks,
        pomodoro_config=pomodoro_config,
        total_estimated_time=total_time,
    )


@router.post("/generate-tasks", response_model=RecommendationResponse)
async def generate_task_recommendations(
    request: SessionDescriptionRequest, db: SessionDep, _: ActiveUserDep
):
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty.")
    return await get_recommendations(request.description, db)


@router.post("/refine-session", response_model=RecommendationResponse)
async def refine_session(
    request: SessionDescriptionRequest, db: SessionDep, _: ActiveUserDep
):
    """
    Refine an existing session using LLM with improved context understanding.
    This endpoint is designed for iterative improvement of session details and tasks.
    """
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty.")
    return await get_recommendations(request.description, db)


@router.post("/optimize-pomodoro", response_model=Dict[str, Any])
async def optimize_pomodoro_schedule(
    request: Dict[str, Any], db: SessionDep, user: ActiveUserDep
):
    """
    Optimize task scheduling and Pomodoro parameters using PyGAD genetic algorithm.
    
    Request body should contain:
    - task_ids: List[int] - IDs of tasks to optimize
    - config: Optional[Dict] - GA configuration parameters
    """
    task_ids = request.get('task_ids', [])
    if not task_ids:
        raise HTTPException(status_code=400, detail="task_ids list cannot be empty.")
    
    # Fetch tasks from database
    tasks = []
    for task_id in task_ids:
        task = db.get(Task, task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
        
        # Verify task belongs to user's sessions
        session = db.get(PomodoroSession, task.session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(
                status_code=403, 
                detail=f"Task {task_id} does not belong to user sessions."
            )
        tasks.append(task)
    
    # Initialize genetic scheduler with optional config
    config = request.get('config', {})
    genetic_scheduler = GeneticScheduler(
        population_size=config.get('population_size', 30),
        generations=config.get('generations', 20),
        mutation_rate=config.get('mutation_rate', 0.1),
        crossover_rate=config.get('crossover_rate', 0.8),
        tournament_size=config.get('tournament_size', 5),
        elitism_count=config.get('elitism_count', 5)
    )
    
    # Run optimization
    try:
        result = genetic_scheduler.optimize(db, user.id, tasks)
        
        # Convert task order to task IDs for response
        optimized_task_ids = [task.id for task in result['task_order']]
        
        return {
            'optimized_task_order': optimized_task_ids,
            'optimized_pomodoro_params': result['pomodoro_params'],
            'fitness_score': result['fitness_score'],
            'generations_completed': result['generations_completed'],
            'message': 'Optimization completed successfully'
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error during optimization: {str(e)}"
        )
