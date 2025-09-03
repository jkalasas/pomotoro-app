# import google.generativeai as genai
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .db import create_db_and_tables
from .auth.router import router as auth_router
from .recommendations.router import router as recommendations_router
from .sessions.router import router as sessions_router
from .scheduler.router import router as scheduler_router
from .analytics.router import router as analytics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from google import generativeai as genai

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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",  # Tauri dev server
        "http://localhost:1421",  # Updated Tauri dev server
        "https://tauri.localhost",  # Tauri production
        "tauri://localhost",  # Tauri custom protocol
        "http://localhost:3000",  # Alternative dev port
        "http://127.0.0.1:1420",  # Alternative localhost
        "http://127.0.0.1:1421",  # Updated alternative localhost
        "http://127.0.0.1:3000",  # Alternative localhost
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(recommendations_router)
app.include_router(sessions_router)
app.include_router(scheduler_router)
app.include_router(analytics_router)
