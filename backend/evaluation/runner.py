#!/usr/bin/env python3
"""
Benchmark runner for GA vs baseline scheduler comparison.

Provides utilities for:
- Loading tasks from database
- Running GA scheduler with mock dependencies
- Running benchmarks across multiple sessions
- Convergence tracking for GA optimization
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any, List, Tuple
import sqlite3

from app.scheduler.genetic_scheduler import GeneticScheduler
from app.models import Task

from .baselines import (
    TaskData,
    BASELINE_SCHEDULERS,
    DETERMINISTIC_BASELINES,
)
from .metrics import ScheduleMetrics, compute_schedule_metrics

if TYPE_CHECKING:
    from sqlmodel import Session
    from app.models import User


class MockUser:
    """Mock user for evaluation (bypasses auth)."""

    id = 1


class MockDB:
    """Mock database session for evaluation (returns empty results for history queries)."""

    def exec(self, stmt: Any) -> Any:
        class Result:
            def all(self) -> list:
                return []

        return Result()


@dataclass
class AlgorithmResult:
    name: str
    metrics_list: List[ScheduleMetrics]

    @property
    def mean_twt(self) -> float:
        return sum(m.total_weighted_tardiness for m in self.metrics_list) / len(
            self.metrics_list
        )

    @property
    def mean_tct(self) -> float:
        return sum(m.total_completion_time for m in self.metrics_list) / len(
            self.metrics_list
        )

    @property
    def mean_otr(self) -> float:
        return sum(m.on_time_rate for m in self.metrics_list) / len(self.metrics_list)

    @property
    def mean_momentum(self) -> float:
        return sum(m.momentum_index for m in self.metrics_list) / len(self.metrics_list)

    @property
    def mean_wct(self) -> float:
        return sum(m.weighted_completion_time for m in self.metrics_list) / len(
            self.metrics_list
        )

    @property
    def mean_csc(self) -> float:
        return sum(m.cognitive_switch_cost for m in self.metrics_list) / len(
            self.metrics_list
        )

    def std_twt(self) -> float:
        mean = self.mean_twt
        variance = sum(
            (m.total_weighted_tardiness - mean) ** 2 for m in self.metrics_list
        ) / len(self.metrics_list)
        return variance**0.5


@dataclass
class BenchmarkResults:
    session_id: int
    task_count: int
    algorithm_results: dict[str, AlgorithmResult] = field(default_factory=dict)


def load_tasks_from_db(db_path: str, session_id: int) -> List[TaskData]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, name, session_id, estimated_completion_time, due_date,
               cognitive_load, completed, "order"
        FROM task
        WHERE session_id = ? AND is_deleted = 0
        ORDER BY "order"
    """,
        (session_id,),
    )

    tasks = []
    for row in cursor.fetchall():
        due_date = None
        if row["due_date"]:
            try:
                due_date = datetime.fromisoformat(row["due_date"])
            except (ValueError, TypeError):
                pass

        tasks.append(
            TaskData(
                id=row["id"],
                name=row["name"],
                estimated_completion_time=row["estimated_completion_time"],
                due_date=due_date,
                cognitive_load=row["cognitive_load"] or 1,
                session_id=row["session_id"],
                order=row["order"],
                completed=bool(row["completed"]),
            )
        )

    conn.close()
    return tasks


def load_all_sessions(db_path: str) -> List[int]:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT DISTINCT s.id
        FROM session s
        JOIN task t ON t.session_id = s.id
        WHERE s.is_deleted = 0 AND t.is_deleted = 0
        GROUP BY s.id
        HAVING COUNT(t.id) >= 3
        ORDER BY COUNT(t.id) DESC
    """)

    session_ids = [row[0] for row in cursor.fetchall()]
    conn.close()
    return session_ids


def tasks_to_model(tasks: List[TaskData]) -> List[Task]:
    return [
        Task(
            id=t.id,
            name=t.name,
            session_id=t.session_id,
            estimated_completion_time=t.estimated_completion_time,
            due_date=t.due_date,
            cognitive_load=t.cognitive_load,
            completed=t.completed,
            order=t.order,
        )
        for t in tasks
    ]


def model_to_tasks(scheduled: List[Task]) -> List[TaskData]:
    return [
        TaskData(
            id=t.id if t.id is not None else 0,
            name=t.name,
            estimated_completion_time=t.estimated_completion_time,
            due_date=t.due_date,
            cognitive_load=t.cognitive_load or 1,
            session_id=t.session_id,
            order=t.order,
            completed=t.completed,
        )
        for t in scheduled
    ]


def run_ga_scheduler(
    tasks: List[TaskData],
    seed: int = 42,
    population_size: int = 50,
    num_generations: int = 80,
) -> Tuple[List[TaskData], float]:
    mock_tasks = tasks_to_model(tasks)

    scheduler = GeneticScheduler(
        population_size=population_size,
        num_generations=num_generations,
        random_seed=seed,
    )

    scheduled, fitness = scheduler.schedule_tasks(
        mock_tasks,
        MockUser(),  # type: ignore[arg-type]
        MockDB(),  # type: ignore[arg-type]
        {},
    )
    return model_to_tasks(scheduled), fitness


def run_ga_with_convergence(
    tasks: List[TaskData],
    seed: int = 42,
    population_size: int = 50,
    num_generations: int = 80,
) -> Tuple[List[TaskData], float, List[float]]:
    import pygad

    mock_tasks = tasks_to_model(tasks)

    if not mock_tasks:
        return [], 0.0, []

    fitness_history: List[float] = []

    def on_generation(ga_instance: pygad.GA) -> None:
        fitness = ga_instance.best_solution()[1]
        fitness_history.append(float(fitness))

    scheduler = GeneticScheduler(
        population_size=population_size,
        num_generations=num_generations,
        random_seed=seed,
    )

    tasks_sorted = sorted(
        mock_tasks,
        key=lambda t: (t.session_id or -1, t.order, t.id or 0),
    )

    session_queues: dict[int, List[Task]] = {}
    for t in tasks_sorted:
        session_queues.setdefault(t.session_id or -1, []).append(t)

    index_by_task_id = {t.id: i for i, t in enumerate(tasks_sorted) if t.id is not None}

    weights = scheduler._calculate_adaptive_weights(MockUser(), MockDB())  # type: ignore[arg-type]
    num_tasks = len(tasks_sorted)

    gene_space: List[dict[str, float]] = [{"low": 0.0, "high": 1.0}] * num_tasks

    multiplier_ranges = {
        1: {"low": 0.8, "high": 1.0},
        2: {"low": 0.9, "high": 1.1},
        3: {"low": 1.0, "high": 1.2},
        4: {"low": 1.1, "high": 1.4},
        5: {"low": 1.2, "high": 1.5},
    }

    for t in tasks_sorted:
        load = t.cognitive_load if t.cognitive_load else 1
        load = max(1, min(5, load))
        r = multiplier_ranges.get(load, {"low": 1.0, "high": 1.2})
        gene_space.append(r)

    def decode(solution: Any) -> List[Task]:
        return scheduler._decode_random_keys(
            solution, session_queues, index_by_task_id, {}
        )

    def fitness_func(ga_instance: Any, solution: Any, solution_idx: int) -> float:
        schedule = decode(solution)
        return float(scheduler._fitness(schedule, weights))

    ga = pygad.GA(
        num_generations=num_generations,
        num_parents_mating=scheduler.num_parents_mating,
        fitness_func=fitness_func,
        sol_per_pop=population_size,
        num_genes=len(gene_space),
        gene_space=gene_space,
        mutation_probability=scheduler.mutation_probability,
        mutation_type="random",
        crossover_type=scheduler.crossover_type,
        parent_selection_type=scheduler.selection_type,
        K_tournament=scheduler.tournament_k,
        keep_parents=scheduler.keep_parents,
        allow_duplicate_genes=True,
        random_seed=seed,
        on_generation=on_generation,
    )

    ga.run()

    solution, best_fitness, _ = ga.best_solution()
    best_schedule = decode(solution)

    return model_to_tasks(best_schedule), float(best_fitness), fitness_history


def run_benchmark(
    db_path: str,
    session_ids: List[int] | None = None,
    num_runs: int = 30,
    baselines: List[str] | None = None,
) -> List[BenchmarkResults]:
    if session_ids is None:
        session_ids = load_all_sessions(db_path)

    if baselines is None:
        baselines = ["RND", "SPT", "EDD", "WSPT"]

    all_results = []

    for session_id in session_ids:
        tasks = load_tasks_from_db(db_path, session_id)
        if len(tasks) < 3:
            continue

        result = BenchmarkResults(session_id=session_id, task_count=len(tasks))
        start_time = datetime.now()

        ga_metrics = []
        for run in range(num_runs):
            try:
                scheduled, _ = run_ga_scheduler(tasks, seed=run * 42)
                metrics = compute_schedule_metrics(scheduled, start_time)
                ga_metrics.append(metrics)
            except Exception as e:
                print(f"GA run {run} failed for session {session_id}: {e}")
                continue

        if ga_metrics:
            result.algorithm_results["GA"] = AlgorithmResult(
                name="GA", metrics_list=ga_metrics
            )

        for baseline_name in baselines:
            scheduler_fn = BASELINE_SCHEDULERS.get(baseline_name)
            if not scheduler_fn:
                continue

            if baseline_name in DETERMINISTIC_BASELINES:
                scheduled = scheduler_fn(tasks)
                metrics = compute_schedule_metrics(scheduled, start_time)
                result.algorithm_results[baseline_name] = AlgorithmResult(
                    name=baseline_name, metrics_list=[metrics]
                )
            else:
                baseline_metrics = []
                for run in range(num_runs):
                    scheduled = scheduler_fn(tasks, seed=run * 42)
                    metrics = compute_schedule_metrics(scheduled, start_time)
                    baseline_metrics.append(metrics)
                result.algorithm_results[baseline_name] = AlgorithmResult(
                    name=baseline_name, metrics_list=baseline_metrics
                )

        all_results.append(result)

    return all_results
