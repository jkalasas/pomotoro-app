from __future__ import annotations

from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta

import numpy as np
import pygad
from sqlmodel import Session as DBSession

from ..models import Task
from ..users.models import User
from ..services.analytics import UserAnalyticsService


class GeneticScheduler:
    def __init__(
        self,
        population_size: int = 80,
        num_generations: int = 120,
        num_parents_mating: int = 20,
        mutation_probability: float = 0.15,
        crossover_type: str = "uniform",
        selection_type: str = "tournament",
        tournament_k: int = 4,
        keep_parents: int = 4,
        random_seed: Optional[int] = None,
    ) -> None:
        self.population_size = population_size
        self.num_generations = num_generations
        self.num_parents_mating = num_parents_mating
        self.mutation_probability = mutation_probability
        self.crossover_type = crossover_type
        self.selection_type = selection_type
        self.tournament_k = tournament_k
        self.keep_parents = keep_parents
        self.random_seed = random_seed

        # Fitness weights base constants; w_u adapted dynamically, w_m/w_v via analytics
        self.base_w_u = 1.0
        self.k_m = 1.0
        self.k_v = 1.0

    def schedule_tasks(
        self,
        tasks: List[Task],
        user: User,
        db: DBSession,
        session_break_durations: Optional[Dict[int, int]] = None,
    ) -> Tuple[List[Task], float]:
        """
        Returns (best_schedule, fitness_score).
        session_break_durations: mapping of session_id -> short_break_duration in minutes
        """
        if not tasks:
            return [], 0.0

        if session_break_durations is None:
            session_break_durations = {}

        # Stable input ordering to map genes -> tasks
        # Keep tasks grouped by session and then by their in-session order to make decoding fast.
        tasks_sorted = sorted(
            tasks,
            key=lambda t: (t.session_id or -1, t.order, t.id or 0),
        )

        # Build session -> queue (ordered) and index lookup
        session_queues: Dict[int, List[Task]] = {}
        for t in tasks_sorted:
            session_queues.setdefault(t.session_id or -1, []).append(t)

        index_by_task_id: Dict[int, int] = {
            t.id: i for i, t in enumerate(tasks_sorted) if t.id is not None
        }

        # Adaptive weights based on analytics
        weights = self._calculate_adaptive_weights(user, db)

        # Gene space:
        # First N genes: priorities in [0, 1]
        # Next N genes: break durations based on cognitive load
        num_tasks = len(tasks_sorted)

        # Priority genes
        gene_space = [{"low": 0.0, "high": 1.0}] * num_tasks

        # Break duration multiplier genes (applied to session's short_break_duration)
        # Higher cognitive load allows for larger break multipliers
        multiplier_ranges = {
            1: {"low": 0.8, "high": 1.0},  # Low intensity: 80%-100% of base break
            2: {"low": 0.9, "high": 1.1},  # Light: 90%-110%
            3: {"low": 1.0, "high": 1.2},  # Moderate: 100%-120%
            4: {"low": 1.1, "high": 1.4},  # High: 110%-140%
            5: {"low": 1.2, "high": 1.5},  # Very high: 120%-150%
        }

        for t in tasks_sorted:
            load = t.cognitive_load if t.cognitive_load else 1
            load = max(1, min(5, load))
            r = multiplier_ranges.get(load, {"low": 1.0, "high": 1.2})
            gene_space.append(r)

        num_genes = len(gene_space)

        # Prepare closure context for fitness/decoder
        def decode(solution: np.ndarray) -> List[Task]:
            return self._decode_random_keys(
                solution, session_queues, index_by_task_id, session_break_durations
            )

        def fitness_func(
            ga_instance: pygad.GA, solution: np.ndarray, solution_idx: int
        ) -> float:  # PyGAD expects (ga, solution, idx)
            schedule = decode(solution)
            return float(self._fitness(schedule, weights))

        # Configure GA
        ga = pygad.GA(
            num_generations=self.num_generations,
            num_parents_mating=self.num_parents_mating,
            fitness_func=fitness_func,
            sol_per_pop=self.population_size,
            num_genes=num_genes,
            gene_space=gene_space,
            mutation_probability=self.mutation_probability,
            mutation_type="random",
            crossover_type=self.crossover_type,
            parent_selection_type=self.selection_type,
            K_tournament=self.tournament_k,
            keep_parents=self.keep_parents,
            allow_duplicate_genes=True,  # priorities can repeat
            random_seed=self.random_seed,
        )

        ga.run()

        solution, best_fitness, _ = ga.best_solution()
        best_schedule = decode(solution)
        return best_schedule, float(best_fitness)

    def _decode_random_keys(
        self,
        solution: np.ndarray,
        session_queues: Dict[int, List[Task]],
        index_by_task_id: Dict[int, int],
        session_break_durations: Dict[int, int],
    ) -> List[Task]:
        num_tasks = len(index_by_task_id)
        default_break = 5

        ptrs: Dict[int, int] = {sid: 0 for sid in session_queues}
        total = sum(len(q) for q in session_queues.values())
        out: List[Task] = []

        while len(out) < total:
            candidate: Optional[Tuple[Task, float]] = None

            for sid, queue in session_queues.items():
                p = ptrs[sid]
                if p >= len(queue):
                    continue
                task = queue[p]
                idx = index_by_task_id.get(task.id)  # type: ignore[arg-type]
                priority = float(solution[idx]) if idx is not None else 0.0

                base_break = session_break_durations.get(sid, default_break)
                multiplier = 1.0
                if idx is not None and (num_tasks + idx) < len(solution):
                    multiplier = float(solution[num_tasks + idx])
                task.suggested_break_duration = int(round(base_break * multiplier))

                # Ties are broken by earlier due date or shorter duration
                if candidate is None:
                    candidate = (task, priority)
                else:
                    _, best_prio = candidate
                    if priority > best_prio:
                        candidate = (task, priority)
                    elif priority == best_prio:
                        cand_task = candidate[0]
                        if self._is_better_tiebreak(task, cand_task):
                            candidate = (task, priority)

            if candidate is None:
                # Should not happen, but guard
                break

            chosen_task = candidate[0]
            out.append(chosen_task)
            # advance pointer of its session
            sid = chosen_task.session_id or -1
            ptrs[sid] += 1

        return out

    def _is_better_tiebreak(self, a: Task, b: Task) -> bool:
        """Prefer earlier due date, then shorter duration, then lower id."""
        if a.due_date and b.due_date:
            if a.due_date != b.due_date:
                return a.due_date < b.due_date
        elif a.due_date and not b.due_date:
            return True
        elif b.due_date and not a.due_date:
            return False
        # shorter estimated time preferred
        if a.estimated_completion_time != b.estimated_completion_time:
            return a.estimated_completion_time < b.estimated_completion_time
        # fallback: smaller id
        return (a.id or 0) < (b.id or 0)

    def _fitness(
        self, chromosome: List[Task], weights: Tuple[float, float, float]
    ) -> float:
        w_u, w_m, w_v = weights

        urgency = self._urgency_score(chromosome)
        momentum = self._momentum_score(chromosome)
        variety = self._variety_score(chromosome)

        # Normalize momentum and variety to comparable ranges
        n = len(chromosome)
        if n > 0:
            momentum /= n  # rough normalization
        if n > 1:
            max_dur = max(max(1, t.estimated_completion_time) for t in chromosome)
            variety = variety / (max_dur * (n - 1))

        return w_u * urgency + w_m * momentum + w_v * variety

    def _urgency_score(self, chromosome: List[Task]) -> float:
        """
        Inverse of total tardiness (minutes) relative to due_date, accumulated
        over the sequence.
        """
        now = datetime.now()
        elapsed = 0
        tardiness = 0.0
        for t in chromosome:
            elapsed += max(0, int(t.estimated_completion_time))
            # Include the suggested break time in the schedule accumulation
            if t.suggested_break_duration:
                elapsed += t.suggested_break_duration

            if t.due_date:
                finish = now + timedelta(minutes=elapsed)
                td = (finish - t.due_date).total_seconds() / 60.0
                if td > 0:
                    tardiness += td
        return 1.0 / (1.0 + tardiness)

    def _momentum_score(self, chromosome: List[Task]) -> float:
        """Prefer shorter tasks earlier (weighted by position)."""
        n = len(chromosome)
        if n == 0:
            return 0.0
        score = 0.0
        for i, t in enumerate(chromosome):
            weight = n - i
            score += weight / max(1, t.estimated_completion_time)
        return score

    def _variety_score(self, chromosome: List[Task]) -> float:
        """Encourage duration variety between adjacent tasks."""
        if len(chromosome) <= 1:
            return 0.0
        s = 0.0
        for i in range(len(chromosome) - 1):
            a = max(1, chromosome[i].estimated_completion_time)
            b = max(1, chromosome[i + 1].estimated_completion_time)
            s += abs(a - b)
        return s

    def _calculate_adaptive_weights(
        self, user: User, db: DBSession
    ) -> Tuple[float, float, float]:
        try:
            completion_rate = UserAnalyticsService.calculate_completion_rate(user, db)
            avg_focus_level = UserAnalyticsService.calculate_average_focus_level(
                user, db
            )
        except Exception as e:
            print(f"Analytics error: {e}; using default adaptive weights")
            completion_rate = 0.5
            avg_focus_level = 3.0

        # Urgency stays base; momentum stronger when completion_rate is low
        w_u = self.base_w_u
        w_m = self.k_m * (1.0 - float(completion_rate))

        # Variety stronger when focus level is low
        f_max, f_min = 5.0, 1.0
        w_v = self.k_v * ((f_max - float(avg_focus_level)) / (f_max - f_min))
        return w_u, w_m, w_v
