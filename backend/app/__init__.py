import google.generativeai as genai
from fastapi import FastAPI
from contextlib import asynccontextmanager

from .config import settings
from .db import create_db_and_tables
from .recommendations.router import router as recommendations_router
from .sessions.router import router as sessions_router
from .scheduler.router import router as scheduler_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application startup...")
    create_db_and_tables()
    genai.configure(api_key=settings.gemini_api_key)
    yield
    print("Application shutdown.")


app = FastAPI(
    title="Productivity Scheduler API",
    description="API for generating and scheduling tasks using Gemini and a Genetic Algorithm.",
    version="2.6.2",
    lifespan=lifespan,
)

app.include_router(recommendations_router)
app.include_router(sessions_router)
app.include_router(scheduler_router)
