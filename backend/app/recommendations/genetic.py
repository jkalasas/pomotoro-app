"""
Genetic Algorithm implementation for optimizing Pomodoro schedules and parameters using PyGAD.

This implementation uses PyGAD to optimize both task scheduling and Pomodoro parameters
for enhanced office worker productivity.
"""
from typing import List, Dict, Optional, Tuple, Any
import numpy as np
import pygad
from datetime import datetime, timedelta
from sqlmodel import Session

from ..models import Task, PomodoroSession
from ..users.models import User
from ..services.analytics import UserAnalyticsService


class GeneticScheduler:
    """Genetic algorithm for optimizing Pomodoro schedules and parameters using PyGAD"""
    
    def __init__(
        self,
        population_size: int = 30,
        generations: int = 20,
        mutation_rate: float = 0.1,
        crossover_rate: float = 0.8,
        tournament_size: int = 5,
        elitism_count: int = 5
    ):
        self.population_size = population_size
        self.generations = generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        self.tournament_size = tournament_size
        self.elitism_count = elitism_count
        
        # Fitness weight constants
        self.w_urgency = 1.0
        self.w_momentum = 1.0
        self.w_variety = 1.0
        self.w_pomodoro_fit = 1.0
        
        # Chromosome structure constants
        self.min_focus_duration = 15  # minutes
        self.max_focus_duration = 45  # minutes
        self.min_break_duration = 5   # minutes
        self.max_break_duration = 15  # minutes
        self.min_long_break = 15      # minutes
        self.max_long_break = 30      # minutes
        self.min_cycles_per_long = 2
        self.max_cycles_per_long = 6
        
        # Instance variables for current optimization
        self.tasks = []
        self.task_priorities = {}
        self.user_weights = (1.0, 1.0, 1.0)
        self.user = None
        self.db = None
        
    def _encode_solution(self, task_order: List[Task], pomodoro_params: Dict[str, int], task_priorities: Dict[int, float]) -> np.ndarray:
        """
        Encodes the task order and Pomodoro parameters into a format suitable for PyGAD.
        
        Chromosome structure:
        [task_indices..., focus_duration, short_break, long_break, long_break_frequency]
        """
        # Task order as indices
        task_indices = []
        for task in task_order:
            try:
                task_indices.append(self.tasks.index(task))
            except ValueError:
                # If task not in current task list, skip it
                continue
        
        # Pad or truncate to match expected task count
        while len(task_indices) < len(self.tasks):
            task_indices.append(0)
        task_indices = task_indices[:len(self.tasks)]
        
        # Pomodoro parameters (normalize to 0-1 range)
        focus_normalized = (pomodoro_params.get('focus_duration', 25) - self.min_focus_duration) / (self.max_focus_duration - self.min_focus_duration)
        short_break_normalized = (pomodoro_params.get('short_break_duration', 5) - self.min_break_duration) / (self.max_break_duration - self.min_break_duration)
        long_break_normalized = (pomodoro_params.get('long_break_duration', 15) - self.min_long_break) / (self.max_long_break - self.min_long_break)
        cycles_normalized = (pomodoro_params.get('long_break_per_pomodoros', 4) - self.min_cycles_per_long) / (self.max_cycles_per_long - self.min_cycles_per_long)
        
        # Combine into chromosome
        chromosome = task_indices + [focus_normalized, short_break_normalized, long_break_normalized, cycles_normalized]
        return np.array(chromosome, dtype=float)
    
    def _decode_solution(self, solution: np.ndarray) -> Tuple[List[Task], Dict[str, int]]:
        """
        Decodes the PyGAD solution back into the task order and Pomodoro parameters.
        """
        # Extract task order
        task_indices = solution[:len(self.tasks)].astype(int)
        # Ensure indices are within valid range
        task_indices = np.clip(task_indices, 0, len(self.tasks) - 1)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_indices = []
        for idx in task_indices:
            if idx not in seen:
                unique_indices.append(idx)
                seen.add(idx)
        
        # Add any missing indices
        for i in range(len(self.tasks)):
            if i not in seen:
                unique_indices.append(i)
        
        task_order = [self.tasks[i] for i in unique_indices[:len(self.tasks)]]
        
        # Extract and denormalize Pomodoro parameters
        param_start = len(self.tasks)
        if len(solution) > param_start + 3:
            focus_norm = np.clip(solution[param_start], 0, 1)
            short_break_norm = np.clip(solution[param_start + 1], 0, 1)
            long_break_norm = np.clip(solution[param_start + 2], 0, 1)
            cycles_norm = np.clip(solution[param_start + 3], 0, 1)
            
            pomodoro_params = {
                'focus_duration': int(self.min_focus_duration + focus_norm * (self.max_focus_duration - self.min_focus_duration)),
                'short_break_duration': int(self.min_break_duration + short_break_norm * (self.max_break_duration - self.min_break_duration)),
                'long_break_duration': int(self.min_long_break + long_break_norm * (self.max_long_break - self.min_long_break)),
                'long_break_per_pomodoros': int(self.min_cycles_per_long + cycles_norm * (self.max_cycles_per_long - self.min_cycles_per_long))
            }
        else:
            # Default parameters if chromosome is malformed
            pomodoro_params = {
                'focus_duration': 25,
                'short_break_duration': 5,
                'long_break_duration': 15,
                'long_break_per_pomodoros': 4
            }
        
        return task_order, pomodoro_params
    
    def _calculate_urgency_score(self, task_order: List[Task]) -> float:
        """Calculate urgency score based on task tardiness."""
        current_time = datetime.now()
        cumulative_time = 0
        total_tardiness = 0
        
        for task in task_order:
            cumulative_time += task.estimated_completion_time
            if task.due_date:
                expected_completion = current_time + timedelta(minutes=cumulative_time)
                tardiness = max(0, (expected_completion - task.due_date).total_seconds() / 60)
                total_tardiness += tardiness
        
        return 1.0 / (1.0 + total_tardiness)
    
    def _calculate_momentum_score(self, task_order: List[Task]) -> float:
        """Calculate momentum score favoring shorter tasks at the beginning."""
        n = len(task_order)
        if n == 0:
            return 0
        
        momentum_score = 0
        for i, task in enumerate(task_order):
            weight = n - i  # Higher weight for earlier positions
            momentum_score += weight / max(1, task.estimated_completion_time)
        
        return momentum_score
    
    def _calculate_variety_score(self, task_order: List[Task]) -> float:
        """Calculate variety score based on task duration differences."""
        if len(task_order) <= 1:
            return 0
        
        variety_score = 0
        for i in range(len(task_order) - 1):
            current_duration = task_order[i].estimated_completion_time
            next_duration = task_order[i + 1].estimated_completion_time
            variety_score += abs(next_duration - current_duration)
        
        # Normalize by maximum possible variety
        max_possible_variety = max(t.estimated_completion_time for t in task_order) * (len(task_order) - 1)
        return variety_score / max(1, max_possible_variety)
    
    def _calculate_pomodoro_fitness(self, pomodoro_params: Dict[str, int], task_order: List[Task]) -> float:
        """Calculate fitness based on Pomodoro parameter suitability for the user."""
        if not self.user or not self.db:
            return 0.5  # Neutral score if no user analytics available
        
        try:
            # Get user performance metrics
            completion_rate = UserAnalyticsService.calculate_completion_rate(self.user, self.db)
            avg_focus_level = UserAnalyticsService.calculate_average_focus_level(self.user, self.db)
            time_ratio = UserAnalyticsService.calculate_estimated_vs_actual_ratio(self.user, self.db)
        except Exception:
            return 0.5
        
        fitness = 0.0
        
        # Focus duration fitness based on user's attention span
        focus_duration = pomodoro_params['focus_duration']
        if avg_focus_level >= 4:  # High focus users can handle longer sessions
            optimal_focus = 35
        elif avg_focus_level <= 2:  # Low focus users need shorter sessions
            optimal_focus = 20
        else:
            optimal_focus = 25
        
        focus_fitness = 1.0 - abs(focus_duration - optimal_focus) / 20.0
        fitness += max(0, focus_fitness)
        
        # Break duration fitness based on completion rate
        short_break = pomodoro_params['short_break_duration']
        if completion_rate < 0.6:  # Users with low completion rates might need longer breaks
            optimal_break = 10
        else:
            optimal_break = 5
        
        break_fitness = 1.0 - abs(short_break - optimal_break) / 10.0
        fitness += max(0, break_fitness)
        
        # Long break frequency based on task complexity
        avg_task_duration = sum(t.estimated_completion_time for t in task_order) / len(task_order) if task_order else 25
        if avg_task_duration > 30:  # Complex tasks need more frequent long breaks
            optimal_frequency = 3
        else:
            optimal_frequency = 4
        
        frequency_fitness = 1.0 - abs(pomodoro_params['long_break_per_pomodoros'] - optimal_frequency) / 4.0
        fitness += max(0, frequency_fitness)
        
        return fitness / 3.0  # Average of the three components
    
    def _calculate_fitness(self, ga_instance, solution: np.ndarray, solution_idx: int) -> float:
        """
        Calculates the fitness of a solution based on user data and task priorities.
        This is the main fitness function called by PyGAD.
        """
        try:
            # Decode the solution
            task_order, pomodoro_params = self._decode_solution(solution)
            
            if not task_order:
                return 0.0
            
            # Calculate component scores
            urgency_score = self._calculate_urgency_score(task_order)
            momentum_score = self._calculate_momentum_score(task_order)
            variety_score = self._calculate_variety_score(task_order)
            pomodoro_fitness = self._calculate_pomodoro_fitness(pomodoro_params, task_order)
            
            # Apply user-specific weights
            w_u, w_m, w_v = self.user_weights
            
            # Combine scores
            total_fitness = (
                w_u * urgency_score +
                w_m * momentum_score +
                w_v * variety_score +
                self.w_pomodoro_fit * pomodoro_fitness
            )
            
            return max(0.0, total_fitness)
            
        except Exception as e:
            # Return minimal fitness for malformed solutions
            print(f"Fitness calculation error: {e}")
            return 0.01
    
    def _calculate_adaptive_weights(self, user: User, db: Session) -> Tuple[float, float, float]:
        """Calculate adaptive weights based on user's historical performance."""
        try:
            completion_rate = UserAnalyticsService.calculate_completion_rate(user, db)
            avg_focus_level = UserAnalyticsService.calculate_average_focus_level(user, db)
        except Exception:
            return (1.0, 1.0, 1.0)  # Default weights
        
        # Urgency weight remains constant
        w_u = self.w_urgency
        
        # Momentum weight - higher for users with low completion rates
        w_m = self.w_momentum * (1.5 - completion_rate)
        
        # Variety weight - higher for users with attention issues
        f_max, f_min = 5, 1
        w_v = self.w_variety * ((f_max - avg_focus_level) / (f_max - f_min))
        
        return (w_u, w_m, w_v)
    
    def optimize(self, db: Session, user_id: int, tasks: List[Task]) -> Dict[str, Any]:
        """
        Run the genetic algorithm to optimize task scheduling and Pomodoro parameters.
        
        Returns:
            Dict containing optimized task order, Pomodoro parameters, and fitness score.
        """
        if not tasks:
            return {
                'task_order': [],
                'pomodoro_params': {
                    'focus_duration': 25,
                    'short_break_duration': 5,
                    'long_break_duration': 15,
                    'long_break_per_pomodoros': 4
                },
                'fitness_score': 0.0
            }
        
        # Set instance variables for fitness function access
        self.tasks = tasks
        self.db = db
        self.user = db.get(User, user_id) if user_id else None
        
        # Calculate task priorities (can be enhanced based on requirements)
        self.task_priorities = {task.id: 1.0 for task in tasks}
        
        # Calculate adaptive weights if user is available
        if self.user:
            self.user_weights = self._calculate_adaptive_weights(self.user, db)
        else:
            self.user_weights = (1.0, 1.0, 1.0)
        
        # Define chromosome structure
        num_task_genes = len(tasks)
        num_param_genes = 4  # focus, short_break, long_break, frequency
        total_genes = num_task_genes + num_param_genes
        
        # Define gene space
        # Task indices: 0 to len(tasks)-1
        # Pomodoro params: 0.0 to 1.0 (normalized)
        gene_space = [list(range(len(tasks)))] * num_task_genes + [{'low': 0.0, 'high': 1.0}] * num_param_genes
        
        # Initialize PyGAD
        ga_instance = pygad.GA(
            num_generations=self.generations,
            num_parents_mating=max(2, self.population_size // 3),
            fitness_func=self._calculate_fitness,
            sol_per_pop=self.population_size,
            num_genes=total_genes,
            gene_type=[int] * num_task_genes + [float] * num_param_genes,
            gene_space=gene_space,
            parent_selection_type="tournament",
            K_tournament=self.tournament_size,
            keep_parents=-1,
            crossover_type="uniform",
            crossover_probability=self.crossover_rate,
            mutation_type="random",
            mutation_probability=self.mutation_rate,
            allow_duplicate_genes=False,
            save_best_solutions=True,
            suppress_warnings=True
        )
        
        # Run the genetic algorithm
        ga_instance.run()
        
        # Get the best solution
        solution, solution_fitness, _ = ga_instance.best_solution()
        
        # Decode the best solution
        optimized_task_order, optimized_pomodoro_params = self._decode_solution(solution)
        
        return {
            'task_order': optimized_task_order,
            'pomodoro_params': optimized_pomodoro_params,
            'fitness_score': solution_fitness,
            'generations_completed': self.generations
        }