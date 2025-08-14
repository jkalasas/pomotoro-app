from typing import List
from pydantic import BaseModel


class ScheduleRequest(BaseModel):
    session_ids: List[int]


class ScheduledTaskResponse(BaseModel):
    id: int
    name: str
    estimated_completion_time: int
    session_id: int
    category: str


class ScheduleResponse(BaseModel):
    scheduled_tasks: List[ScheduledTaskResponse]
    total_schedule_time: int
