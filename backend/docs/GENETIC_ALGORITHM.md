# Genetic Algorithm Task Scheduler (PyGAD-based)

This document describes the current scheduler, implemented with PyGAD and a random-keys encoding that preserves the natural order of tasks inside each session while allowing interleaving across sessions.

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

### Encoding and Feasibility (Random-Keys + Decoder)
- Each gene is a float priority in [0, 1] corresponding to a task.
- A deterministic decoder performs a K-way merge across sessions: at each step, it picks the head task of any session with the highest priority. This enforces in-session order (no invalid permutations) while permitting interleaving across sessions.
- Ties are broken by earlier due date, then shorter estimated time, then lower task id.

### Genetic Algorithm Configuration (PyGAD)
- **Population size**: 80 solutions
- **Generations**: 120 iterations
- **Selection**: Tournament selection (K = 4)
- **Crossover**: Uniform crossover on priority vectors
- **Mutation**: Random mutation with probability 0.15
- **Elitism**: Keep 4 parents
- **Gene space**: Uniform [0.0, 1.0] per gene

### User Analytics Integration
- Tracks task completion rates over time
- Monitors average focus levels from session feedback
- Calculates estimation accuracy (actual vs estimated time)
- Provides performance insights by category and time of day

## API Endpoints

### Schedule Generation (default uses PyGAD)
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
Let e_i be estimated minutes, d_i the due date (optional), and t_0 = now.
Finish time f_i = t_0 + Σ_{k=1..i} e_k.
Per-task tardiness T_i = max(0, minutes(f_i - d_i)), treating T_i = 0 if d_i is missing.
Total tardiness T_total(C) = Σ_{i=1..n} T_i.

S_urgency(C) = 1 / (1 + T_total(C))
```

### Momentum Score
```
Raw: M_raw(C) = Σ_{i=1..n} (n - i) / max(1, e_i)
Normalized: S_momentum(C) = M_raw(C) / n
```

### Variety Score
```
Raw: V_raw(C) = Σ_{i=1..n-1} | max(1, e_{i+1}) - max(1, e_i) |
Let e_max = max_i max(1, e_i) and n > 1.
Normalized: S_variety(C) = V_raw(C) / (e_max · (n - 1))
```

### Adaptive Weights
```
w_u = 1.0
w_m = k_m × (1 - R_comp), with k_m = 1.0
w_v = k_v × (F_max - F̄_feedback) / (F_max - F_min), with k_v = 1.0,
      F_max = 5.0, F_min = 1.0
```

## Implementation Files

- `app/scheduler/pygad_scheduler.py` — Core GA implementation (class `GeneticScheduler`), random-keys encoding + decoder
- `app/scheduler/router.py` — API endpoints (default `/scheduler/generate-schedule` uses `GeneticScheduler`)
- `app/scheduler/schemas.py` — Request/response models
- `app/services/analytics.py` — User performance analytics powering adaptive weights
- `app/models.py` — Database models (e.g., `Task.due_date`, `Task.order`)

## Testing

Key validation points to consider:
- Unit tests for decoder correctness (session-order preservation)
- Fitness function validation (urgency, momentum, variety)
- PyGAD integration (selection, crossover, mutation behaviors)
- API endpoint functionality

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
