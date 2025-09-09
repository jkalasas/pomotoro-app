"""
Deprecated GA scheduler.

The old in-house GA implementation has been replaced by the PyGAD-based
implementation. Use `app.scheduler.pygad_scheduler.GeneticScheduler` instead.
"""

from typing import Any, List, Tuple


class GeneticAlgorithmScheduler:  # pragma: no cover - kept only for backward compatibility
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError(
            "GeneticAlgorithmScheduler is deprecated. Use app.scheduler.pygad_scheduler.GeneticScheduler instead."
        )

    def schedule_tasks(self, *args: Any, **kwargs: Any) -> Tuple[List[Any], float]:
        raise RuntimeError(
            "GeneticAlgorithmScheduler is deprecated. Use app.scheduler.pygad_scheduler.GeneticScheduler instead."
        )
