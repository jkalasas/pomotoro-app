"""
Baseline Schedulers for GA Comparison

Implements classical scheduling heuristics:
- Random: Null hypothesis baseline
- FCFS: First-Come-First-Served (by task ID)
- SPT: Shortest Processing Time first
- EDD: Earliest Due Date first
- WSPT: Weighted Shortest Processing Time (w = cognitive_load²)
"""

from typing import List, Callable
import random as rnd
from dataclasses import dataclass
from datetime import datetime
from copy import deepcopy


@dataclass
class TaskData:
    """Simplified task representation for scheduling."""

    id: int
    name: str
    estimated_completion_time: int  # minutes
    due_date: datetime | None
    cognitive_load: int  # 1-5
    session_id: int | None
    order: int
    completed: bool = False

    @property
    def weight(self) -> float:
        """Quadratic weight mapping: w = c²"""
        return self.cognitive_load**2


def random_scheduler(tasks: List[TaskData], seed: int | None = None) -> List[TaskData]:
    """
    Random Scheduler (RND)

    Randomly shuffles tasks. Used as null hypothesis baseline.

    Time Complexity: O(n)
    Optimizes: Nothing
    """
    result = deepcopy(tasks)
    if seed is not None:
        rnd.seed(seed)
    rnd.shuffle(result)
    return result


def fcfs_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    First-Come-First-Served (FCFS)

    Orders tasks by their ID (proxy for creation order).

    Time Complexity: O(n log n)
    Optimizes: Fairness
    """
    return sorted(deepcopy(tasks), key=lambda t: t.id)


def spt_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    Shortest Processing Time (SPT)

    Orders tasks by ascending duration. Optimal for minimizing
    total completion time (Σ Cⱼ) on single machine.

    Time Complexity: O(n log n)
    Optimizes: Total Completion Time

    Reference: Smith (1956)
    """
    return sorted(deepcopy(tasks), key=lambda t: t.estimated_completion_time)


def lpt_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    Longest Processing Time (LPT)

    Orders tasks by descending duration. Opposite of SPT.

    Time Complexity: O(n log n)
    """
    return sorted(deepcopy(tasks), key=lambda t: -t.estimated_completion_time)


def edd_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    Earliest Due Date (EDD)

    Orders tasks by ascending due date. Tasks without due dates
    are placed at the end. Optimal for minimizing maximum lateness
    (Lmax) on single machine.

    Time Complexity: O(n log n)
    Optimizes: Maximum Lateness

    Reference: Jackson's Rule (1955)
    """
    tasks_copy = deepcopy(tasks)
    with_deadline = [t for t in tasks_copy if t.due_date is not None]
    without_deadline = [t for t in tasks_copy if t.due_date is None]

    sorted_with_deadline = sorted(with_deadline, key=lambda t: t.due_date)
    return sorted_with_deadline + without_deadline


def wspt_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    Weighted Shortest Processing Time (WSPT)

    Orders tasks by descending weight/duration ratio.
    Weight = cognitive_load². Optimal for minimizing weighted
    completion time (Σ wⱼCⱼ) on single machine.

    Time Complexity: O(n log n)
    Optimizes: Weighted Completion Time

    Reference: Smith (1956)
    """

    def ratio(t: TaskData) -> float:
        duration = max(1, t.estimated_completion_time)
        return t.weight / duration

    return sorted(deepcopy(tasks), key=ratio, reverse=True)


def cls_ascending_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    Cognitive Load Sorted - Ascending (CLS-ASC)

    Orders tasks by ascending cognitive load (easy first).

    Time Complexity: O(n log n)
    """
    return sorted(deepcopy(tasks), key=lambda t: t.cognitive_load)


def cls_descending_scheduler(tasks: List[TaskData]) -> List[TaskData]:
    """
    Cognitive Load Sorted - Descending (CLS-DESC)

    Orders tasks by descending cognitive load (hard first).

    Time Complexity: O(n log n)
    """
    return sorted(deepcopy(tasks), key=lambda t: -t.cognitive_load)


# Registry of all baseline schedulers
BASELINE_SCHEDULERS: dict[str, Callable] = {
    "RND": random_scheduler,
    "FCFS": fcfs_scheduler,
    "SPT": spt_scheduler,
    "LPT": lpt_scheduler,
    "EDD": edd_scheduler,
    "WSPT": wspt_scheduler,
    "CLS_ASC": cls_ascending_scheduler,
    "CLS_DESC": cls_descending_scheduler,
}

# Deterministic baselines (don't need multiple runs)
DETERMINISTIC_BASELINES = {"FCFS", "SPT", "LPT", "EDD", "WSPT", "CLS_ASC", "CLS_DESC"}
STOCHASTIC_BASELINES = {"RND"}
