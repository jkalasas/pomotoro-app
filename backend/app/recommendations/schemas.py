from typing import List

from pydantic import BaseModel, Field


class SessionDescriptionRequest(BaseModel):
    description: str = Field(
        ..., example="I want to add authentication in our fastapi project using JWT."
    )


class TaskResponse(BaseModel):
    name: str
    category: str
    estimated_completion_time: int
    cognitive_load: int = 1


class PomodoroConfig(BaseModel):
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int


class SessionInfo(BaseModel):
    name: str
    description: str


class RecommendationResponse(BaseModel):
    session: SessionInfo
    generated_tasks: List[TaskResponse]
    pomodoro_config: PomodoroConfig
    total_estimated_time: int
