from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict
import numpy
import pygad
from sqlmodel import select

from ..db import get_session
from ..models import Task, PomodoroSession
from .schemas import ScheduleRequest, ScheduleResponse, ScheduledTaskResponse

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])


def order_crossover(parents, offspring_size, ga_instance):
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


def schedule_tasks_with_ga(session_ids: List[int], db) -> ScheduleResponse:
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
        penalty = 0
        scheduled_tasks = [flat_task_list[int(idx)] for idx in solution]

        # Penalty for violating task order within sessions (hard constraint)
        current_schedule_positions = {
            task.id: pos for pos, task in enumerate(scheduled_tasks)
        }
        for session_id in tasks_by_session:
            session_tasks = sorted(tasks_by_session[session_id], key=lambda t: t.id)
            for i in range(len(session_tasks)):
                for j in range(i + 1, len(session_tasks)):
                    task1 = session_tasks[i]
                    task2 = session_tasks[j]
                    pos1 = current_schedule_positions.get(task1.id)
                    pos2 = current_schedule_positions.get(task2.id)
                    if pos1 is None or pos2 is None:
                        penalty += 10000
                        continue
                    if pos1 > pos2:
                        penalty += 1000  # Very strong penalty for wrong order

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
        session_block_count = {}
        for block in session_blocks:
            if block:
                session_id = block[0].session_id
                session_block_count[session_id] = (
                    session_block_count.get(session_id, 0) + 1
                )

        # Heavy penalty for any session that appears in more than one block
        fragmentation_penalty = 0
        for session_id, block_count in session_block_count.items():
            if block_count > 1:
                # Each additional block for a session adds exponential penalty
                fragmentation_penalty += ((block_count - 1) ** 2) * 200

        # Bonus for keeping sessions together as large continuous blocks
        # The larger the continuous block, the better
        continuity_bonus = 0
        total_tasks_per_session = {
            sid: len(tasks) for sid, tasks in tasks_by_session.items()
        }

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

    response_tasks = [
        ScheduledTaskResponse(
            id=task.id,
            name=task.name,
            estimated_completion_time=task.estimated_completion_time,
            session_id=task.session_id,
            category=task.categories[0].name if task.categories else "Uncategorized",
        )
        for task in scheduled_tasks_ordered
    ]
    total_time = sum(task.estimated_completion_time for task in response_tasks)
    return ScheduleResponse(
        scheduled_tasks=response_tasks, total_schedule_time=total_time
    )


@router.post("/generate-schedule", response_model=ScheduleResponse)
def generate_schedule(request: ScheduleRequest, db=Depends(get_session)):
    if not request.session_ids:
        raise HTTPException(status_code=400, detail="Session IDs list cannot be empty.")
    return schedule_tasks_with_ga(request.session_ids, db)
