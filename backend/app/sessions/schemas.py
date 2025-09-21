from typing import List, Optional
from pydantic import BaseModel
from enum import Enum
from datetime import datetime


class FocusLevel(str, Enum):
    HIGHLY_DISTRACTED = "HIGHLY_DISTRACTED"
    DISTRACTED = "DISTRACTED"
    NEUTRAL = "NEUTRAL"
    FOCUSED = "FOCUSED"
    HIGHLY_FOCUSED = "HIGHLY_FOCUSED"


class PomodoroConfig(BaseModel):
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int


class TaskResponse(BaseModel):
    name: str
    category: str
    estimated_completion_time: int
    due_date: Optional[datetime] = None


class SessionCreate(BaseModel):
    name: Optional[str] = None
    description: str
    pomodoro_config: PomodoroConfig
    tasks: List[TaskResponse]


class TaskComplete(BaseModel):
    actual_completion_time: Optional[int] = None


class SessionPublic(BaseModel):
    id: int
    name: str
    description: str
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int
    completed: Optional[bool] = False
    completed_at: Optional[datetime] = None
    archived: Optional[bool] = False
    archived_at: Optional[datetime] = None


class TaskPublic(BaseModel):
    id: int
    name: str
    estimated_completion_time: int
    category: str
    completed: bool
    actual_completion_time: Optional[int] = None
    due_date: Optional[datetime] = None
    archived: Optional[bool] = False
    archived_at: Optional[datetime] = None


class SessionWithTasksPublic(SessionPublic):
    tasks: List[TaskPublic]
    archived: Optional[bool] = False
    archived_at: Optional[datetime] = None


class SessionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    focus_duration: Optional[int] = None
    short_break_duration: Optional[int] = None
    long_break_duration: Optional[int] = None
    long_break_per_pomodoros: Optional[int] = None


class ActiveSessionCreate(BaseModel):
    session_id: int


class ActiveSessionPublic(BaseModel):
    id: int
    session_id: int
    current_task_id: Optional[int]
    is_running: bool
    time_remaining: int
    phase: str
    pomodoros_completed: int


class ActiveSessionUpdate(BaseModel):
    is_running: Optional[bool] = None
    time_remaining: Optional[int] = None
    phase: Optional[str] = None
    current_task_id: Optional[int] = None
    pomodoros_completed: Optional[int] = None


class SessionFeedbackCreate(BaseModel):
    focus_level: FocusLevel
    session_reflection: Optional[str] = None


class SessionFeedbackPublic(BaseModel):
    id: int
    session_id: int
    focus_level: str
    session_reflection: Optional[str]
    tasks_completed: int
    tasks_failed: int
    focus_duration_minutes: int
    created_at: datetime


class SessionCompleteRequest(BaseModel):
    focus_level: FocusLevel
    session_reflection: Optional[str] = None


class TaskCreate(BaseModel):
    name: str
    category: str
    estimated_completion_time: int
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    estimated_completion_time: Optional[int] = None
    due_date: Optional[datetime] = None


class TaskReorder(BaseModel):
    task_ids: List[int]
