from fastapi import APIRouter, HTTPException
from typing import List, Dict
import numpy
import pygad
from sqlmodel import select

from ..auth.deps import ActiveUserDep
from ..db import SessionDep
from ..models import PomodoroSession, Task
from .schemas import ScheduleRequest, ScheduleResponse, ScheduledTaskResponse, UserAnalyticsResponse, ScheduleReorderRequest
from .genetic_algorithm import GeneticAlgorithmScheduler
from ..services.analytics import UserAnalyticsService

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])


def order_crossover(parents, offspring_size, ga_instance):
    """Order Crossover (OX1) implementation for PyGAD."""
    offspring = []
    idx = 0
    while len(offspring) < offspring_size[0]:
        parent1 = parents[idx % parents.shape[0], :].copy()
        parent2 = parents[(idx + 1) % parents.shape[0], :].copy()
        start, end = sorted(numpy.random.choice(range(len(parent1)), 2, replace=False))
        child = [None] * len(parent1)
        child[start : end + 1] = parent1[start : end + 1]
        p2_idx = 0
        for i in range(len(child)):
            if child[i] is None:
                while parent2[p2_idx] in child:
                    p2_idx += 1
                child[i] = parent2[p2_idx]
        offspring.append(child)
        idx += 1
    return numpy.array(offspring)


def schedule_tasks_with_ga_pygad(session_ids: List[int], db) -> ScheduleResponse:
    """
    Schedule tasks using PyGAD genetic algorithm implementation.
    This is the PyGAD-based implementation mentioned in the repository context.
    """
    statement = select(Task).where(Task.session_id.in_(session_ids))
    all_tasks = db.exec(statement).all()
    if not all_tasks:
        raise HTTPException(
            status_code=404, detail="No tasks found for the provided session IDs."
        )

    tasks_by_session: Dict[int, List[Task]] = {}
    task_order_map: Dict[int, int] = {}

    for task in all_tasks:
        tasks_by_session.setdefault(task.session_id, []).append(task)

    flat_task_list = []
    for session_id in sorted(tasks_by_session.keys()):
        sorted_tasks = sorted(tasks_by_session[session_id], key=lambda t: t.id)
        for i, task in enumerate(sorted_tasks):
            task_order_map[task.id] = i
        flat_task_list.extend(sorted_tasks)

    task_indices = list(range(len(flat_task_list)))

    def fitness_func(ga_instance, solution, solution_idx):
        """Fitness function for PyGAD optimization."""
        scheduled_tasks = [flat_task_list[int(idx)] for idx in solution]
        
        # Base penalty for task completion
        penalty = 0
        for i, task in enumerate(scheduled_tasks):
            penalty += i * task.estimated_completion_time
        
        # Calculate session blocks and heavily penalize fragmentation
        session_switches = 0
        prev_session_id = None
        session_blocks = []
        current_block = []

        for task in scheduled_tasks:
            if prev_session_id is not None and task.session_id != prev_session_id:
                session_switches += 1
                if current_block:
                    session_blocks.append(current_block)
                current_block = [task]
            else:
                current_block.append(task)
            prev_session_id = task.session_id

        if current_block:
            session_blocks.append(current_block)

        # Heavily penalize session switching - we want complete sessions, not interleaving
        # Exponential penalty for each switch to strongly discourage fragmentation
        switch_penalty = (session_switches**2) * 50

        # Reward completing entire sessions before moving to the next
        # Check if any session is fragmented (appears in multiple blocks)
        total_tasks_per_session = {}
        for task in scheduled_tasks:
            total_tasks_per_session.setdefault(task.session_id, 0)
            total_tasks_per_session[task.session_id] += 1

        fragmentation_penalty = 0
        continuity_bonus = 0
        
        for block in session_blocks:
            if block:
                session_id = block[0].session_id
                block_size = len(block)
                total_tasks = total_tasks_per_session[session_id]

                # Bonus for completing a significant portion of a session in one block
                completion_ratio = block_size / total_tasks
                if completion_ratio >= 1.0:  # Complete session
                    continuity_bonus += 100
                elif completion_ratio >= 0.8:  # Almost complete
                    continuity_bonus += 50
                elif completion_ratio >= 0.5:  # Substantial portion
                    continuity_bonus += 20

        total_penalty = (
            penalty + switch_penalty + fragmentation_penalty - continuity_bonus
        )
        return 1.0 / (1.0 + max(0, total_penalty))
    
    sol_per_pop = 50
    initial_population = numpy.array(
        [numpy.random.permutation(task_indices) for _ in range(sol_per_pop)], dtype=int
    )

    ga_instance = pygad.GA(
        num_generations=100,
        num_parents_mating=10,
        fitness_func=fitness_func,
        initial_population=initial_population,
        sol_per_pop=sol_per_pop,
        num_genes=len(flat_task_list),
        gene_type=int,
        gene_space=task_indices,
        allow_duplicate_genes=False,
        parent_selection_type="sss",
        crossover_type=order_crossover,
        mutation_type="swap",
        mutation_percent_genes=10,
        keep_elitism=5,
        on_generation=lambda g: print(
            f"Generation {g.generations_completed}, Best Fitness: {g.best_solution()[1]}"
        ),
    )
    ga_instance.run()

    best_solution_indices, best_solution_fitness, _ = ga_instance.best_solution()
    scheduled_tasks_ordered = [
        flat_task_list[int(idx)] for idx in best_solution_indices
    ]
    
    # Convert to response format
    response_tasks = [
        ScheduledTaskResponse(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            session_id=task.session_id,
            category="",  # Empty since we're showing session names instead
            due_date=task.due_date.isoformat() if task.due_date else None,
            completed=task.completed
        )
        for task in scheduled_tasks_ordered
    ]
    
    total_time = sum(task.estimated_completion_time for task in scheduled_tasks_ordered)
    
    return ScheduleResponse(
        scheduled_tasks=response_tasks, 
        total_schedule_time=total_time,
        fitness_score=float(best_solution_fitness)
    )


def schedule_tasks_with_ga(session_ids: List[int], db, user: ActiveUserDep) -> ScheduleResponse:
    """
    Schedule tasks using the Genetic Algorithm implementation from IMPLEMENTATION.md
    """
    # Get all non-completed tasks for the specified sessions
    statement = select(Task).where(
        Task.session_id.in_(session_ids),
        Task.completed == False
    )
    all_tasks = db.exec(statement).all()
    
    if not all_tasks:
        raise HTTPException(
            status_code=404, detail="No uncompleted tasks found for the provided session IDs."
        )

    # Group tasks by session for validation
    tasks_by_session: Dict[int, List[Task]] = {}
    for task in all_tasks:
        tasks_by_session.setdefault(task.session_id, []).append(task)

    # Convert to list for GA processing
    task_list = list(all_tasks)
    
    # Initialize and run genetic algorithm
    ga_scheduler = GeneticAlgorithmScheduler(
        population_size=50,
        num_generations=100,
        tournament_size=5,
        crossover_probability=0.8,
        mutation_probability=0.1,
        elitism_count=5
    )
    
    # Get the optimized schedule
    optimized_schedule, fitness_score = ga_scheduler.schedule_tasks(task_list, user, db)
    
    # Convert to response format
    response_tasks = [
        ScheduledTaskResponse(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            session_id=task.session_id,
            category="",  # Empty since we're showing session names instead
            due_date=task.due_date.isoformat() if task.due_date else None,
            completed=task.completed
        )
        for task in optimized_schedule
    ]
    
    total_time = sum(task.estimated_completion_time for task in optimized_schedule)
    
    return ScheduleResponse(
        scheduled_tasks=response_tasks, 
        total_schedule_time=total_time,
        fitness_score=fitness_score
    )


@router.post("/generate-schedule", response_model=ScheduleResponse)
def generate_schedule(request: ScheduleRequest, db: SessionDep, user: ActiveUserDep):
    """
    Generate an optimized task schedule using genetic algorithm
    """
    # Verify user owns all requested sessions
    query = select(PomodoroSession).where(
        PomodoroSession.id.in_(request.session_ids),
        PomodoroSession.user_id != user.id
    )

    unauthorized_sessions = db.exec(query).first()
    if unauthorized_sessions:
        raise HTTPException(
            status_code=403,
            detail="Cannot schedule tasks from sessions not owned by the user.",
        )

    if not request.session_ids:
        raise HTTPException(status_code=400, detail="Session IDs list cannot be empty.")
    
    return schedule_tasks_with_ga(request.session_ids, db, user)


@router.post("/generate-schedule-pygad", response_model=ScheduleResponse)
def generate_schedule_with_pygad(request: ScheduleRequest, db: SessionDep, user: ActiveUserDep):
    """
    Generate an optimized task schedule using PyGAD genetic algorithm implementation.
    This endpoint uses the PyGAD library for enhanced performance and configurability.
    """
    # Verify user owns all requested sessions
    query = select(PomodoroSession).where(
        PomodoroSession.id.in_(request.session_ids),
        PomodoroSession.user_id != user.id
    )

    unauthorized_sessions = db.exec(query).first()
    if unauthorized_sessions:
        raise HTTPException(
            status_code=403,
            detail="Cannot schedule tasks from sessions not owned by the user.",
        )

    if not request.session_ids:
        raise HTTPException(status_code=400, detail="Session IDs list cannot be empty.")
    
    return schedule_tasks_with_ga_pygad(request.session_ids, db)


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


@router.put("/reorder-schedule", response_model=ScheduleResponse)
def reorder_schedule(
    request: ScheduleReorderRequest, 
    db: SessionDep, 
    user: ActiveUserDep
):
    """
    Reorder the current generated schedule based on user preference.
    This allows users to manually adjust the AI-generated optimal schedule.
    """
    try:
        # Get all tasks by their IDs and verify they belong to user sessions
        tasks = []
        for task_id in request.task_ids:
            task = db.get(Task, task_id)
            if not task:
                raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
            
            # Verify the task belongs to a session owned by the user
            session = db.get(PomodoroSession, task.session_id)
            if not session or session.user_id != user.id:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Task {task_id} does not belong to user sessions"
                )
            tasks.append(task)
        
        # Convert to ScheduledTaskResponse format maintaining the requested order
        scheduled_tasks = []
        total_time = 0
        
        for task in tasks:
            # Get category name
            category_name = "Uncategorized"
            if task.categories:
                category_name = task.categories[0].name
                
            scheduled_task = ScheduledTaskResponse(
                id=task.id,
                name=task.name,
                estimated_completion_time=task.estimated_completion_time,
                session_id=task.session_id,
                category=category_name,
                due_date=task.due_date.isoformat() if task.due_date else None,
                completed=task.completed
            )
            scheduled_tasks.append(scheduled_task)
            total_time += task.estimated_completion_time
        
        # Return the reordered schedule with a default fitness score
        # In a more sophisticated implementation, you could recalculate fitness
        return ScheduleResponse(
            scheduled_tasks=scheduled_tasks,
            total_schedule_time=total_time,
            fitness_score=0.0  # User-modified schedules get neutral score
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reordering schedule: {str(e)}")
