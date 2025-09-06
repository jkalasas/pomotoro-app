"""
Genetic Algorithm implementation for task scheduling as specified in IMPLEMENTATION.md
"""
from typing import List, Dict, Optional, Tuple
import random
from datetime import datetime, timedelta
from sqlmodel import Session, select

from ..models import Task, SessionFeedback
from ..users.models import User
from ..services.analytics import UserAnalyticsService


class GeneticAlgorithmScheduler:
    """
    Genetic Algorithm for optimizing task schedules based on urgency, momentum, and variety.
    """
    
    def __init__(
        self,
        population_size: int = 50,
        num_generations: int = 100,
        tournament_size: int = 5,
        crossover_probability: float = 0.8,
        mutation_probability: float = 0.1,
        elitism_count: int = 5
    ):
        self.population_size = population_size
        self.num_generations = num_generations
        self.tournament_size = tournament_size
        self.crossover_probability = crossover_probability
        self.mutation_probability = mutation_probability
        self.elitism_count = elitism_count
        
        # Adaptive weight scaling constants
        self.k_m = 1.0  # Momentum weight scaling
        self.k_v = 1.0  # Variety weight scaling
        
        # Fitness weight constants
        self.w_u = 1.0  # Urgency weight (constant)
        
    def calculate_adaptive_weights(self, user: User, db: Session) -> Tuple[float, float, float]:
        """
        Calculate adaptive weights based on user's historical performance.
        Returns (w_u, w_m, w_v) tuple.
        """
        try:
            # Use analytics service to get performance metrics
            completion_rate = UserAnalyticsService.calculate_completion_rate(user, db)
            avg_focus_level = UserAnalyticsService.calculate_average_focus_level(user, db)
        except Exception as e:
            # Fallback to default values if analytics service fails
            print(f"Analytics service error: {e}, using default weights")
            completion_rate = 0.5
            avg_focus_level = 3.0
        
        # Calculate adaptive weights
        w_u = self.w_u  # Urgency weight remains constant
        w_m = self.k_m * (1 - completion_rate)  # Higher momentum weight for low completion rate
        
        # Variety weight based on distraction levels (higher variety for more distracted users)
        f_max, f_min = 5, 1
        w_v = self.k_v * ((f_max - avg_focus_level) / (f_max - f_min))
        
        return w_u, w_m, w_v
    
    def calculate_urgency_score(self, chromosome: List[Task]) -> float:
        """
        Calculate urgency score based on task tardiness.
        """
        current_time = datetime.now()
        cumulative_time = 0
        total_tardiness = 0
        
        for task in chromosome:
            cumulative_time += task.estimated_completion_time
            if task.due_date:
                expected_completion = current_time + timedelta(minutes=cumulative_time)
                tardiness = max(0, (expected_completion - task.due_date).total_seconds() / 60)
                total_tardiness += tardiness
        
        return 1.0 / (1.0 + total_tardiness)
    
    def calculate_momentum_score(self, chromosome: List[Task]) -> float:
        """
        Calculate momentum score favoring shorter tasks at the beginning.
        """
        n = len(chromosome)
        if n == 0:
            return 0
        
        momentum_score = 0
        for i, task in enumerate(chromosome):
            weight = n - i  # Higher weight for earlier positions
            momentum_score += weight / max(1, task.estimated_completion_time)
        
        return momentum_score
    
    def calculate_variety_score(self, chromosome: List[Task]) -> float:
        """
        Calculate variety score based on task duration differences.
        """
        if len(chromosome) <= 1:
            return 0
        
        variety_score = 0
        for i in range(len(chromosome) - 1):
            current_duration = chromosome[i].estimated_completion_time
            next_duration = chromosome[i + 1].estimated_completion_time
            variety_score += abs(next_duration - current_duration)
        
        return variety_score
    
    def fitness_function(
        self, 
        chromosome: List[Task], 
        weights: Tuple[float, float, float]
    ) -> float:
        """
        Calculate fitness score for a chromosome (task schedule).
        """
        w_u, w_m, w_v = weights
        
        urgency_score = self.calculate_urgency_score(chromosome)
        momentum_score = self.calculate_momentum_score(chromosome)
        variety_score = self.calculate_variety_score(chromosome)
        
        # Normalize variety score
        if len(chromosome) > 1:
            max_possible_variety = max(t.estimated_completion_time for t in chromosome) * (len(chromosome) - 1)
            variety_score = variety_score / max(1, max_possible_variety)
        
        fitness = w_u * urgency_score + w_m * momentum_score + w_v * variety_score
        return fitness
    
    def tournament_selection(
        self, 
        population: List[List[Task]], 
        fitness_scores: List[float]
    ) -> List[Task]:
        """
        Tournament selection for parent selection.
        """
        tournament_indices = random.sample(range(len(population)), self.tournament_size)
        tournament_fitness = [fitness_scores[i] for i in tournament_indices]
        winner_index = tournament_indices[tournament_fitness.index(max(tournament_fitness))]
        return population[winner_index].copy()
    
    def order_crossover(self, parent1: List[Task], parent2: List[Task]) -> List[Task]:
        """
        Order Crossover (OX1) implementation.
        """
        n = len(parent1)
        if n <= 2:
            return parent1.copy()
        
        # Select two random crossover points
        start, end = sorted(random.sample(range(n), 2))
        
        # Create child with None values
        child = [None] * n
        
        # Copy the selected segment from parent1
        child[start:end+1] = parent1[start:end+1]
        
        # Fill remaining positions with tasks from parent2 in order
        child_tasks_ids = {task.id for task in child if task is not None}
        p2_tasks = [task for task in parent2 if task.id not in child_tasks_ids]
        
        p2_index = 0
        for i in range(n):
            if child[i] is None:
                child[i] = p2_tasks[p2_index]
                p2_index += 1
        
        return child
    
    def swap_mutation(self, chromosome: List[Task]) -> List[Task]:
        """
        Swap mutation implementation.
        """
        if len(chromosome) < 2:
            return chromosome
        
        mutated = chromosome.copy()
        i, j = random.sample(range(len(mutated)), 2)
        mutated[i], mutated[j] = mutated[j], mutated[i]
        return mutated
    
    def create_initial_population(self, tasks: List[Task]) -> List[List[Task]]:
        """
        Create initial population of random task permutations.
        """
        population = []
        for _ in range(self.population_size):
            shuffled_tasks = tasks.copy()
            random.shuffle(shuffled_tasks)
            population.append(shuffled_tasks)
        return population
    
    def evolve_population(
        self, 
        population: List[List[Task]], 
        weights: Tuple[float, float, float]
    ) -> List[List[Task]]:
        """
        Evolve the population for one generation.
        """
        # Calculate fitness for all chromosomes
        fitness_scores = [
            self.fitness_function(chromosome, weights) 
            for chromosome in population
        ]
        
        # Sort population by fitness (descending)
        sorted_indices = sorted(range(len(fitness_scores)), key=lambda i: fitness_scores[i], reverse=True)
        sorted_population = [population[i] for i in sorted_indices]
        
        # Keep elite chromosomes
        new_population = sorted_population[:self.elitism_count]
        
        # Generate offspring
        while len(new_population) < self.population_size:
            # Selection
            parent1 = self.tournament_selection(population, fitness_scores)
            parent2 = self.tournament_selection(population, fitness_scores)
            
            # Crossover
            if random.random() < self.crossover_probability:
                child = self.order_crossover(parent1, parent2)
            else:
                child = parent1.copy()
            
            # Mutation
            if random.random() < self.mutation_probability:
                child = self.swap_mutation(child)
            
            new_population.append(child)
        
        return new_population
    
    def schedule_tasks(
        self, 
        tasks: List[Task], 
        user: User, 
        db: Session
    ) -> Tuple[List[Task], float]:
        """
        Main method to schedule tasks using genetic algorithm.
        Returns the best schedule and its fitness score.
        """
        if not tasks:
            return [], 0.0
        
        # Calculate adaptive weights
        weights = self.calculate_adaptive_weights(user, db)
        
        # Create initial population
        population = self.create_initial_population(tasks)
        
        best_fitness = float('-inf')
        best_schedule = None
        
        # Evolution loop
        for generation in range(self.num_generations):
            # Evolve population
            population = self.evolve_population(population, weights)
            
            # Track best solution
            generation_fitness = [
                self.fitness_function(chromosome, weights) 
                for chromosome in population
            ]
            
            max_fitness = max(generation_fitness)
            if max_fitness > best_fitness:
                best_fitness = max_fitness
                best_schedule = population[generation_fitness.index(max_fitness)].copy()
            
            # Optional: Print progress
            if generation % 20 == 0:
                print(f"Generation {generation}: Best fitness = {best_fitness:.4f}")
        
        return best_schedule if best_schedule else tasks, best_fitness
