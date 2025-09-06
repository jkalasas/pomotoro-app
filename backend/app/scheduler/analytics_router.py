from fastapi import APIRouter, HTTPException
from typing import Dict, List, Any
from sqlmodel import select

from ..auth.deps import ActiveUserDep
from ..db import SessionDep
from ..services.analytics import UserAnalyticsService
from .schemas import UserAnalyticsResponse

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/user-insights", response_model=UserAnalyticsResponse)
def get_user_insights(db: SessionDep, user: ActiveUserDep):
    """
    Get user analytics insights for the genetic algorithm scheduler.
    """
    try:
        completion_rate = UserAnalyticsService.calculate_completion_rate(user, db)
        focus_level = UserAnalyticsService.calculate_average_focus_level(user, db)
        time_ratio = UserAnalyticsService.calculate_estimated_vs_actual_ratio(user, db)
        category_performance = UserAnalyticsService.get_task_category_performance(user, db)
        time_of_day_performance = UserAnalyticsService.get_time_of_day_performance(user, db)
        
        return UserAnalyticsResponse(
            completion_rate=completion_rate,
            average_focus_level=focus_level,
            estimated_vs_actual_ratio=time_ratio,
            category_performance=category_performance,
            time_of_day_performance=time_of_day_performance
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating user insights: {str(e)}")


@router.post("/update-daily-stats")
def update_daily_stats(db: SessionDep, user: ActiveUserDep):
    """
    Update daily statistics for the current user.
    """
    try:
        UserAnalyticsService.update_daily_stats(user, db)
        return {"message": "Daily statistics updated successfully"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating daily stats: {str(e)}")
