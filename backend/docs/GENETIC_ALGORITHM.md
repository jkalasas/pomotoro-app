# Genetic Algorithm Task Scheduler Implementation

This implementation follows the specifications in `IMPLEMENTATION.md` and provides a complete genetic algorithm solution for optimizing task schedules in the Pomodoro application.

## Overview

The genetic algorithm optimizes task schedules by maximizing a fitness function that considers:
- **Urgency**: Minimizes task tardiness relative to due dates
- **Momentum**: Places shorter tasks earlier to build completion momentum
- **Variety**: Alternates task durations to reduce cognitive fatigue

## Key Features

### Adaptive Weighting System
- **Momentum weight** adjusts based on user's historical completion rate
- **Variety weight** adjusts based on user's focus level feedback
- **Urgency weight** remains constant as deadlines are always critical

### Genetic Algorithm Components
- **Population size**: 50 chromosomes
- **Generations**: 100 iterations
- **Selection**: Tournament selection with size 5
- **Crossover**: Order Crossover (OX1) with 80% probability
- **Mutation**: Swap mutation with 10% probability
- **Elitism**: Top 5 chromosomes preserved each generation

### User Analytics Integration
- Tracks task completion rates over time
- Monitors average focus levels from session feedback
- Calculates estimation accuracy (actual vs estimated time)
- Provides performance insights by category and time of day

## API Endpoints

### Schedule Generation
```
POST /scheduler/generate-schedule
{
  "session_ids": [1, 2, 3]
}
```

### User Insights
```
GET /scheduler/user-insights
```

### Daily Statistics Update
```
POST /scheduler/update-daily-stats
```

## Database Schema Updates

### Task Model
- Added `due_date` field for urgency calculations
- Maintains existing fields for compatibility

### Analytics Tables
- Leverages existing analytics infrastructure
- Tracks session feedback for adaptive weighting
- Stores daily/weekly performance statistics

## Mathematical Formulas

### Fitness Function
```
F(C) = w_u × S_urgency(C) + w_m × S_momentum(C) + w_v × S_variety(C)
```

### Urgency Score
```
S_urgency(C) = 1 / (1 + T_total(C))
where T_total(C) = Σ max(0, E_C(t_i) - D(t_i))
```

### Momentum Score
```
S_momentum(C) = Σ (n-i+1) / E_t(t_i)
```

### Variety Score
```
S_variety(C) = Σ |E_t(t_{i+1}) - E_t(t_i)|
```

### Adaptive Weights
```
w_m = k_m × (1 - R_comp)
w_v = k_v × (F_max - F̄_feedback) / (F_max - F_min)
```

## Implementation Files

- `app/scheduler/genetic_algorithm.py` - Core GA implementation
- `app/scheduler/router.py` - API endpoints
- `app/scheduler/schemas.py` - Request/response models
- `app/services/analytics.py` - User performance analytics
- `app/models.py` - Updated database models
- `migrate_db.py` - Database migration script

## Testing

The implementation has been thoroughly tested:
- Unit tests for all GA components
- Fitness function validation
- Genetic operator verification
- API endpoint functionality
- Database migration success

## Usage Example

1. Create tasks with due dates and estimated completion times
2. Submit session IDs to the scheduler endpoint
3. Receive optimized task ordering with fitness score
4. System learns from user performance and adapts over time

## Performance Characteristics

- Optimizes schedules for up to hundreds of tasks efficiently
- Converges to high-quality solutions within 100 generations
- Adapts to user behavior patterns automatically
- Maintains backward compatibility with existing system

## Future Enhancements

- Real-time schedule adjustments during sessions
- Integration with calendar systems for deadline management
- Machine learning for more sophisticated user modeling
- Multi-objective optimization for additional constraints
