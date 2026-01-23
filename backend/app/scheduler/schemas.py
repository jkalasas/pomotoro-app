from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime


class ScheduleRequest(BaseModel):
    session_ids: List[int]


class ScheduledTaskResponse(BaseModel):
    id: int
    name: str
    estimated_completion_time: int
    session_id: int
    category: str
    due_date: Optional[str] = None  # ISO format datetime string
    completed: bool = False
    cognitive_load: int = 1  # 1-5 scale for cognitive intensity


class ScheduleResponse(BaseModel):
    scheduled_tasks: List[ScheduledTaskResponse]
    total_schedule_time: int
    fitness_score: float = 0.0


class ScheduleReorderRequest(BaseModel):
    task_ids: List[int]


class RescheduleRemainingRequest(BaseModel):
    session_ids: List[int]
    current_task_id: int
