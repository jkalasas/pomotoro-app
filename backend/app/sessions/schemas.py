from typing import List, Optional
from pydantic import BaseModel


class PomodoroConfig(BaseModel):
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int


class TaskResponse(BaseModel):
    name: str
    category: str
    estimated_completion_time: int


class SessionCreate(BaseModel):
    description: str
    pomodoro_config: PomodoroConfig
    tasks: List[TaskResponse]


class SessionPublic(BaseModel):
    id: int
    description: str
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int


class TaskPublic(BaseModel):
    id: int
    name: str
    estimated_completion_time: int
    category: str


class SessionWithTasksPublic(SessionPublic):
    tasks: List[TaskPublic]


class SessionUpdate(BaseModel):
    description: Optional[str] = None
