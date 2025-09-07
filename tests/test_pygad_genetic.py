"""
Test script for validating the PyGAD genetic algorithm implementation.

This script tests the genetic algorithm's functionality to ensure that the optimized
task order and parameters are reasonable and that the implementation works correctly.
"""
import sys
import os

# Set environment variables for testing
os.environ['GEMINI_API_KEY'] = 'test_key'
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import unittest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime, timedelta
import numpy as np

from app.recommendations.genetic import GeneticScheduler
from app.models import Task, PomodoroSession
from app.users.models import User


class TestPyGADGenetic(unittest.TestCase):
    """Test cases for the PyGAD genetic algorithm implementation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.scheduler = GeneticScheduler(
            population_size=10,
            generations=5,
            mutation_rate=0.1,
            crossover_rate=0.8,
            tournament_size=3,
            elitism_count=2
        )
        
        # Create mock tasks
        self.tasks = [
            Mock(spec=Task),
            Mock(spec=Task),
            Mock(spec=Task),
            Mock(spec=Task)
        ]
        
        # Set task attributes
        for i, task in enumerate(self.tasks):
            task.id = i + 1
            task.name = f"Task {i + 1}"
            task.estimated_completion_time = 25 + (i * 10)  # 25, 35, 45, 55 minutes
            task.due_date = datetime.now() + timedelta(hours=i + 1)
            task.completed = False
            task.session_id = 1
        
        # Create mock user and database
        self.mock_user = Mock(spec=User)
        self.mock_user.id = 1
        
        self.mock_db = Mock()
        self.mock_db.get.return_value = self.mock_user
        
    def test_encode_decode_solution(self):
        """Test encoding and decoding of solutions."""
        # Set up scheduler with tasks
        self.scheduler.tasks = self.tasks
        
        # Create test data
        task_order = self.tasks.copy()
        pomodoro_params = {
            'focus_duration': 25,
            'short_break_duration': 5,
            'long_break_duration': 15,
            'long_break_per_pomodoros': 4
        }
        task_priorities = {task.id: 1.0 for task in self.tasks}
        
        # Test encoding
        encoded = self.scheduler._encode_solution(task_order, pomodoro_params, task_priorities)
        self.assertIsInstance(encoded, np.ndarray)
        self.assertEqual(len(encoded), len(self.tasks) + 4)  # tasks + 4 pomodoro params
        
        # Test decoding
        decoded_tasks, decoded_params = self.scheduler._decode_solution(encoded)
        
        # Verify decoded data
        self.assertEqual(len(decoded_tasks), len(self.tasks))
        self.assertIn('focus_duration', decoded_params)
        self.assertIn('short_break_duration', decoded_params)
        self.assertIn('long_break_duration', decoded_params)
        self.assertIn('long_break_per_pomodoros', decoded_params)
        
        # Check parameter ranges
        self.assertGreaterEqual(decoded_params['focus_duration'], self.scheduler.min_focus_duration)
        self.assertLessEqual(decoded_params['focus_duration'], self.scheduler.max_focus_duration)
        self.assertGreaterEqual(decoded_params['short_break_duration'], self.scheduler.min_break_duration)
        self.assertLessEqual(decoded_params['short_break_duration'], self.scheduler.max_break_duration)
    
    def test_urgency_score_calculation(self):
        """Test urgency score calculation."""
        # Set up tasks with different due dates
        now = datetime.now()
        urgent_task = Mock(spec=Task)
        urgent_task.estimated_completion_time = 30
        urgent_task.due_date = now + timedelta(minutes=10)  # Very urgent
        
        normal_task = Mock(spec=Task)
        normal_task.estimated_completion_time = 30
        normal_task.due_date = now + timedelta(hours=2)  # Not urgent
        
        # Test with urgent task first (should have higher urgency score)
        urgent_first = [urgent_task, normal_task]
        urgent_score = self.scheduler._calculate_urgency_score(urgent_first)
        
        # Test with normal task first
        normal_first = [normal_task, urgent_task]
        normal_score = self.scheduler._calculate_urgency_score(normal_first)
        
        # Urgent task first should have better urgency score
        self.assertGreaterEqual(urgent_score, normal_score)
    
    def test_momentum_score_calculation(self):
        """Test momentum score calculation."""
        # Create tasks with different completion times
        short_task = Mock(spec=Task)
        short_task.estimated_completion_time = 15
        
        long_task = Mock(spec=Task)
        long_task.estimated_completion_time = 60
        
        # Short task first should have better momentum score
        short_first = [short_task, long_task]
        short_score = self.scheduler._calculate_momentum_score(short_first)
        
        long_first = [long_task, short_task]
        long_score = self.scheduler._calculate_momentum_score(long_first)
        
        self.assertGreater(short_score, long_score)
    
    def test_variety_score_calculation(self):
        """Test variety score calculation."""
        # Tasks with varying durations should have higher variety score
        varied_tasks = [
            Mock(spec=Task, estimated_completion_time=15),
            Mock(spec=Task, estimated_completion_time=45),
            Mock(spec=Task, estimated_completion_time=25),
        ]
        
        # Tasks with similar durations
        similar_tasks = [
            Mock(spec=Task, estimated_completion_time=25),
            Mock(spec=Task, estimated_completion_time=25),
            Mock(spec=Task, estimated_completion_time=25),
        ]
        
        varied_score = self.scheduler._calculate_variety_score(varied_tasks)
        similar_score = self.scheduler._calculate_variety_score(similar_tasks)
        
        self.assertGreater(varied_score, similar_score)
    
    def test_pomodoro_fitness_calculation(self):
        """Test Pomodoro parameter fitness calculation."""
        # Set up scheduler with user context
        self.scheduler.user = self.mock_user
        self.scheduler.db = self.mock_db
        
        # Mock analytics service calls
        import app.services.analytics as analytics_module
        original_service = analytics_module.UserAnalyticsService
        
        mock_service = Mock()
        mock_service.calculate_completion_rate.return_value = 0.8
        mock_service.calculate_average_focus_level.return_value = 4.0
        mock_service.calculate_estimated_vs_actual_ratio.return_value = 1.1
        analytics_module.UserAnalyticsService = mock_service
        
        try:
            # Test with good Pomodoro parameters for high-focus user
            good_params = {
                'focus_duration': 35,  # Good for high focus
                'short_break_duration': 5,  # Good for high completion rate
                'long_break_duration': 15,
                'long_break_per_pomodoros': 4
            }
            
            good_fitness = self.scheduler._calculate_pomodoro_fitness(good_params, self.tasks)
            
            # Test with poor parameters
            poor_params = {
                'focus_duration': 15,  # Too short for high focus user
                'short_break_duration': 15,  # Too long for high completion rate
                'long_break_duration': 30,
                'long_break_per_pomodoros': 2
            }
            
            poor_fitness = self.scheduler._calculate_pomodoro_fitness(poor_params, self.tasks)
            
            # Good parameters should have higher fitness
            self.assertGreater(good_fitness, poor_fitness)
            
        finally:
            # Restore original service
            analytics_module.UserAnalyticsService = original_service
    
    def test_fitness_function_integration(self):
        """Test the main fitness function with a complete solution."""
        # Set up scheduler with required context
        self.scheduler.tasks = self.tasks
        self.scheduler.user = self.mock_user
        self.scheduler.db = self.mock_db
        self.scheduler.user_weights = (1.0, 1.0, 1.0)
        self.scheduler.task_priorities = {task.id: 1.0 for task in self.tasks}
        
        # Create a solution chromosome
        task_indices = [0, 1, 2, 3]  # Task order
        pomodoro_params = [0.5, 0.0, 0.5, 0.5]  # Normalized parameters
        solution = np.array(task_indices + pomodoro_params, dtype=float)
        
        # Mock analytics service
        import app.services.analytics as analytics_module
        original_service = analytics_module.UserAnalyticsService
        
        mock_service = Mock()
        mock_service.calculate_completion_rate.return_value = 0.7
        mock_service.calculate_average_focus_level.return_value = 3.0
        mock_service.calculate_estimated_vs_actual_ratio.return_value = 1.0
        analytics_module.UserAnalyticsService = mock_service
        
        try:
            # Test fitness calculation
            fitness = self.scheduler._calculate_fitness(None, solution, 0)
            
            # Fitness should be a positive number
            self.assertIsInstance(fitness, (int, float))
            self.assertGreaterEqual(fitness, 0.0)
            
        finally:
            analytics_module.UserAnalyticsService = original_service
    
    def test_adaptive_weights_calculation(self):
        """Test adaptive weight calculation based on user performance."""
        # Mock analytics service
        import app.services.analytics as analytics_module
        original_service = analytics_module.UserAnalyticsService
        
        mock_service = Mock()
        analytics_module.UserAnalyticsService = mock_service
        
        try:
            # Test with low completion rate user
            mock_service.calculate_completion_rate.return_value = 0.3
            mock_service.calculate_average_focus_level.return_value = 2.0
            
            weights_low = self.scheduler._calculate_adaptive_weights(self.mock_user, self.mock_db)
            
            # Test with high completion rate user
            mock_service.calculate_completion_rate.return_value = 0.9
            mock_service.calculate_average_focus_level.return_value = 4.5
            
            weights_high = self.scheduler._calculate_adaptive_weights(self.mock_user, self.mock_db)
            
            # Low completion rate should have higher momentum weight
            self.assertGreater(weights_low[1], weights_high[1])  # Momentum weight
            
            # Low focus should have higher variety weight
            self.assertGreater(weights_low[2], weights_high[2])  # Variety weight
            
        finally:
            analytics_module.UserAnalyticsService = original_service
    
    def test_optimize_empty_tasks(self):
        """Test optimization with empty task list."""
        result = self.scheduler.optimize(self.mock_db, 1, [])
        
        self.assertEqual(result['task_order'], [])
        self.assertIn('pomodoro_params', result)
        self.assertEqual(result['fitness_score'], 0.0)
    
    def test_optimize_with_tasks(self):
        """Test optimization with actual tasks."""
        # Mock analytics service to avoid database dependencies
        import app.services.analytics as analytics_module
        original_service = analytics_module.UserAnalyticsService
        
        mock_service = Mock()
        mock_service.calculate_completion_rate.return_value = 0.7
        mock_service.calculate_average_focus_level.return_value = 3.5
        mock_service.calculate_estimated_vs_actual_ratio.return_value = 1.0
        analytics_module.UserAnalyticsService = mock_service
        
        try:
            # Run optimization with minimal generations for speed
            self.scheduler.generations = 2
            self.scheduler.population_size = 5
            
            result = self.scheduler.optimize(self.mock_db, 1, self.tasks)
            
            # Verify result structure
            self.assertIn('task_order', result)
            self.assertIn('pomodoro_params', result)
            self.assertIn('fitness_score', result)
            self.assertIn('generations_completed', result)
            
            # Verify task order
            self.assertEqual(len(result['task_order']), len(self.tasks))
            
            # Verify Pomodoro parameters
            params = result['pomodoro_params']
            self.assertIn('focus_duration', params)
            self.assertIn('short_break_duration', params)
            self.assertIn('long_break_duration', params)
            self.assertIn('long_break_per_pomodoros', params)
            
            # Verify parameter ranges
            self.assertGreaterEqual(params['focus_duration'], self.scheduler.min_focus_duration)
            self.assertLessEqual(params['focus_duration'], self.scheduler.max_focus_duration)
            
            # Verify fitness score
            self.assertIsInstance(result['fitness_score'], (int, float))
            self.assertGreaterEqual(result['fitness_score'], 0.0)
            
        finally:
            analytics_module.UserAnalyticsService = original_service


def run_tests():
    """Run all tests and display results."""
    print("Running PyGAD Genetic Algorithm Tests...")
    print("=" * 50)
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestPyGADGenetic)
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print("\n" + "=" * 50)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    
    if result.failures:
        print("\nFailures:")
        for test, traceback in result.failures:
            print(f"- {test}: {traceback}")
    
    if result.errors:
        print("\nErrors:")
        for test, traceback in result.errors:
            print(f"- {test}: {traceback}")
    
    success = len(result.failures) == 0 and len(result.errors) == 0
    print(f"\nResult: {'PASSED' if success else 'FAILED'}")
    
    return success


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)