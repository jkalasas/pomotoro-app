import os
import json
import statistics
import google.generativeai as genai
from dotenv import load_dotenv
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Body, Depends
from pydantic import BaseModel, Field
from sqlmodel import Field as SQLField
from sqlmodel import SQLModel, create_engine, Session, select, Relationship


load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found. Please set it in your .env file.")

genai.configure(api_key=GEMINI_API_KEY)


class TaskCategoryLink(SQLModel, table=True):
    task_id: Optional[int] = SQLField(
        default=None, foreign_key="task.id", primary_key=True
    )
    category_id: Optional[int] = SQLField(
        default=None, foreign_key="category.id", primary_key=True
    )


class Category(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True, unique=True)
    tasks: List["Task"] = Relationship(
        back_populates="categories", link_model=TaskCategoryLink
    )


class PomodoroSession(SQLModel, table=True):
    __tablename__ = "session"  # Explicitly set table name to match original schema

    id: Optional[int] = SQLField(default=None, primary_key=True)
    description: str
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int

    tasks: List["Task"] = Relationship(back_populates="session")


class Task(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True)
    # A task with session_id=None is a historical task for dataset purposes
    session_id: Optional[int] = SQLField(
        default=None, foreign_key="session.id", index=True
    )

    estimated_completion_time: int  # From LLM
    actual_completion_time: Optional[int] = None  # For completed historical tasks

    categories: List[Category] = Relationship(
        back_populates="tasks", link_model=TaskCategoryLink
    )
    session: Optional[PomodoroSession] = Relationship(back_populates="tasks")


DATABASE_URL = "sqlite:///database.db"
engine = create_engine(
    DATABASE_URL, echo=True, connect_args={"check_same_thread": False}
)


def get_session():
    """FastAPI dependency to get a database session."""
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    """Creates database tables and seeds them with initial data."""
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        if not session.exec(select(Category)).first():
            print("Seeding database with initial categories and tasks...")
            # Seed Categories
            backend_dev = Category(name="Backend Development")
            auth_cat = Category(name="Authentication")
            security_cat = Category(name="Security")
            db_cat = Category(name="Database")
            doc_cat = Category(name="Documentation")

            session.add_all([backend_dev, auth_cat, security_cat, db_cat, doc_cat])
            session.commit()  # Commit to get IDs

            # Seed historical Tasks (no session_id)
            tasks_to_seed = [
                Task(
                    name="Create User Registration Endpoint",
                    estimated_completion_time=60,
                    actual_completion_time=55,
                    categories=[backend_dev],
                ),
                Task(
                    name="Set up JWT token generation",
                    estimated_completion_time=45,
                    actual_completion_time=40,
                    categories=[auth_cat],
                ),
                Task(
                    name="Implement token verification middleware",
                    estimated_completion_time=60,
                    actual_completion_time=70,
                    categories=[auth_cat],
                ),
                Task(
                    name="Design login endpoint logic",
                    estimated_completion_time=45,
                    actual_completion_time=45,
                    categories=[backend_dev],
                ),
                Task(
                    name="Password Hashing Implementation",
                    estimated_completion_time=30,
                    actual_completion_time=25,
                    categories=[security_cat],
                ),
                Task(
                    name="JWT token creation endpoint",
                    estimated_completion_time=60,
                    actual_completion_time=50,
                    categories=[backend_dev],
                ),
                Task(
                    name="JWT token creation endpoint",
                    estimated_completion_time=60,
                    actual_completion_time=65,
                    categories=[backend_dev],
                ),
                Task(
                    name="Design Database Schema",
                    estimated_completion_time=90,
                    actual_completion_time=90,
                    categories=[db_cat],
                ),
                Task(
                    name="Write API documentation",
                    estimated_completion_time=120,
                    actual_completion_time=120,
                    categories=[doc_cat],
                ),
            ]
            session.add_all(tasks_to_seed)
            session.commit()
            print("Database seeded.")


class SessionDescriptionRequest(BaseModel):
    description: str = Field(
        ..., example="I want to add authentication in our fastapi project using JWT."
    )


class TaskResponse(BaseModel):
    name: str
    category: str
    estimated_completion_time: int


class PomodoroConfig(BaseModel):
    focus_duration: int
    short_break_duration: int
    long_break_duration: int
    long_break_per_pomodoros: int


class RecommendationResponse(BaseModel):
    generated_tasks: List[TaskResponse]
    pomodoro_config: PomodoroConfig
    total_estimated_time: int


async def call_gemini_for_tasks(description: str) -> dict:
    """
    Calls the Gemini API to break down a description into tasks and a Pomodoro setup.
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = f"""
    You are a project management assistant. Your task is to break down a user's goal into a list of smaller, actionable tasks.
    You must also suggest a standard Pomodoro timer configuration.
    The user's goal is: "{description}"

    Analyze the goal and provide a response in a strict JSON format. The JSON object must have two keys:
    1. "tasks": A list of JSON objects, where each object has "name" (string), "category" (string), and "estimated_completion_time" (integer in minutes).
    2. "pomodoro_setup": A JSON object with "focus_duration", "short_break_duration", "long_break_duration" (all integers in minutes), and "long_break_per_pomodoros" (integer).

    Example Response Format:
    {{
      "tasks": [
        {{"name": "Task 1 Name", "category": "Category A", "estimated_completion_time": 45}},
        {{"name": "Task 2 Name", "category": "Category B", "estimated_completion_time": 60}}
      ],
      "pomodoro_setup": {{
        "focus_duration": 25,
        "short_break_duration": 5,
        "long_break_duration": 15,
        "long_break_per_pomodoros": 4
      }}
    }}

    Do not include any text or markdown formatting outside of the main JSON object.
    """
    try:
        response = await model.generate_content_async(prompt)
        # Clean up the response to ensure it's valid JSON
        cleaned_response_text = (
            response.text.strip().replace("```json", "").replace("```", "").strip()
        )
        return json.loads(cleaned_response_text)
    except Exception as e:
        print(f"Error calling Gemini API or parsing JSON: {e}")
        raise HTTPException(
            status_code=503, detail=f"Error communicating with the LLM service: {e}"
        )


def query_database_for_similar_tasks(
    task_name: str, category_name: str, db: Session
) -> List[int]:
    """
    Queries the database for completed tasks that are similar based on category and name.
    """
    statement = (
        select(Task.actual_completion_time)
        .join(TaskCategoryLink, Task.id == TaskCategoryLink.task_id)
        .join(Category, Category.id == TaskCategoryLink.category_id)
        .where(Category.name == category_name)
        .where(Task.name.ilike(f"%{task_name}%"))  # Case-insensitive partial match
        .where(Task.actual_completion_time != None)  # Only completed tasks
    )
    results = db.exec(statement).all()
    return results


async def get_recommendations(description: str, db: Session) -> RecommendationResponse:
    """
    Orchestrates the recommendation process by calling the LLM and querying the database.
    """
    llm_output = await call_gemini_for_tasks(description)

    class LlmTask(BaseModel):
        name: str
        category: str
        estimated_completion_time: int

    initial_tasks = [LlmTask(**task) for task in llm_output["tasks"]]
    pomodoro_config = PomodoroConfig(**llm_output["pomodoro_setup"])

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

        similar_task_times = query_database_for_similar_tasks(
            task.name, task.category, db
        )

        final_estimate = task.estimated_completion_time

        if len(similar_task_times) >= SIMILARITY_THRESHOLD:
            historical_average = round(statistics.mean(similar_task_times))
            final_estimate = historical_average

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application startup...")
    create_db_and_tables()
    yield
    print("Application shutdown.")


app = FastAPI(
    title="Productivity Scheduler API",
    description="API for generating task schedules using Gemini and historical data.",
    version="2.4.0",
    lifespan=lifespan,
)


@app.post(
    "/recommendations/generate-tasks",
    response_model=RecommendationResponse,
    tags=["Recommendations"],
)
async def generate_task_recommendations(
    request: SessionDescriptionRequest = Body(...), db: Session = Depends(get_session)
):
    """
    Generates a list of tasks and a Pomodoro schedule from a session description.
    """
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="Description cannot be empty.")

    recommendations = await get_recommendations(request.description, db)
    return recommendations


@app.get("/", tags=["Root"])
async def read_root():
    return {
        "message": "Welcome to the Invasive Hybrid Recommendation-Based Scheduling API v2.4!"
    }
