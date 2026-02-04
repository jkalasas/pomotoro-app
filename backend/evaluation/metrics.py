"""Schedule quality metrics: TWT, TCT, OTR, Momentum, Makespan."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List

from .baselines import TaskData


@dataclass
class ScheduleMetrics:
    total_weighted_tardiness: float  # Σ wⱼTⱼ
    total_completion_time: float  # Σ Cⱼ (minutes)
    on_time_rate: float  # 1 - (tardy_count / n)
    momentum_index: float  # Position-weighted inverse duration
    makespan: float  # Cmax (minutes)
    max_lateness: float  # Lmax (minutes, can be negative)
    weighted_completion_time: float  # Σ wⱼCⱼ
    cognitive_switch_cost: float  # Σ |cᵢ - cᵢ₊₁|
    tardy_count: int
    task_count: int


def compute_schedule_metrics(
    schedule: List[TaskData], start_time: datetime | None = None
) -> ScheduleMetrics:
    if not schedule:
        return ScheduleMetrics(
            total_weighted_tardiness=0.0,
            total_completion_time=0.0,
            on_time_rate=1.0,
            momentum_index=0.0,
            makespan=0.0,
            max_lateness=0.0,
            weighted_completion_time=0.0,
            cognitive_switch_cost=0.0,
            tardy_count=0,
            task_count=0,
        )

    if start_time is None:
        start_time = datetime.now()

    n = len(schedule)
    current_time = start_time

    twt = 0.0
    tct = 0.0
    wct = 0.0
    tardy_count = 0
    mi = 0.0
    csc = 0.0
    max_lateness = float("-inf")

    for k, task in enumerate(schedule):
        current_time += timedelta(minutes=task.estimated_completion_time)

        elapsed_minutes = (current_time - start_time).total_seconds() / 60
        weight = task.weight

        if task.due_date:
            lateness = (current_time - task.due_date).total_seconds() / 60
            tardiness = max(0, lateness)
            is_tardy = 1 if lateness > 0 else 0

            twt += weight * tardiness
            tardy_count += is_tardy
            max_lateness = max(max_lateness, lateness)

        tct += elapsed_minutes
        wct += weight * elapsed_minutes

        position_weight = n - k
        mi += position_weight / max(1, task.estimated_completion_time)

        if k > 0:
            prev_load = schedule[k - 1].cognitive_load
            curr_load = task.cognitive_load
            csc += abs(curr_load - prev_load)

    makespan = (current_time - start_time).total_seconds() / 60
    otr = (n - tardy_count) / n if n > 0 else 1.0
    mi_normalized = mi / n if n > 0 else 0.0

    if max_lateness == float("-inf"):
        max_lateness = 0.0

    return ScheduleMetrics(
        total_weighted_tardiness=twt,
        total_completion_time=tct,
        on_time_rate=otr,
        momentum_index=mi_normalized,
        makespan=makespan,
        max_lateness=max_lateness,
        weighted_completion_time=wct,
        cognitive_switch_cost=csc,
        tardy_count=tardy_count,
        task_count=n,
    )


def compute_improvement_ratio(baseline_value: float, ga_value: float) -> float:
    if baseline_value == 0:
        return 0.0 if ga_value == 0 else -100.0
    return ((baseline_value - ga_value) / baseline_value) * 100


def cliffs_delta(x: List[float], y: List[float]) -> tuple[float, str]:
    """Cliff's delta effect size: P(X > Y) - P(X < Y)."""
    if not x or not y:
        return 0.0, "negligible"

    n_x, n_y = len(x), len(y)
    more = sum(1 for xi in x for yj in y if xi > yj)
    less = sum(1 for xi in x for yj in y if xi < yj)

    delta = (more - less) / (n_x * n_y)

    abs_delta = abs(delta)
    if abs_delta < 0.147:
        interpretation = "negligible"
    elif abs_delta < 0.33:
        interpretation = "small"
    elif abs_delta < 0.474:
        interpretation = "medium"
    else:
        interpretation = "large"

    return delta, interpretation
