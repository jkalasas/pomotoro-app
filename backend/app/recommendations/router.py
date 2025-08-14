from fastapi import APIRouter, Depends, HTTPException
from typing import List
from pydantic import BaseModel

from ..db import get_session
from ..models import Category, Task, TaskCategoryLink
from .schemas import (
    SessionDescriptionRequest,
    RecommendationResponse,
    TaskResponse,
    PomodoroConfig,
)
from ..services.llm import call_gemini_for_tasks
from sqlmodel import select
import statistics

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


async def get_recommendations(description: str, db) -> RecommendationResponse:
    llm_output = await call_gemini_for_tasks(description)

    class LlmTask(BaseModel):
        name: str
        category: str
        estimated_completion_time: int

    initial_tasks = [LlmTask(**task) for task in llm_output.get("tasks", [])]
    pomodoro_config = PomodoroConfig(**llm_output.get("pomodoro_setup", {}))

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
        generated_tasks=final_tasks,
        pomodoro_config=pomodoro_config,
        total_estimated_time=total_time,
    )


@router.post("/generate-tasks", response_model=RecommendationResponse)
async def generate_task_recommendations(
    request: SessionDescriptionRequest, db=Depends(get_session)
):
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty.")
    return await get_recommendations(request.description, db)
