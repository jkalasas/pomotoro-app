from typing import List, Optional, Dict
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


class ScheduleResponse(BaseModel):
    scheduled_tasks: List[ScheduledTaskResponse]
    total_schedule_time: int
    fitness_score: float = 0.0


class ScheduleReorderRequest(BaseModel):
    task_ids: List[int]


class UserAnalyticsResponse(BaseModel):
    completion_rate: float
    average_focus_level: float
    estimated_vs_actual_ratio: float
    category_performance: Dict[str, float]
    time_of_day_performance: Dict[str, float]
