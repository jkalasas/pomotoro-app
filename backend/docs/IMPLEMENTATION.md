## Genetic Algorithm
To address the task scheduling problem, a Genetic Algorithm (GA) is employed. The GA is a metaheuristic inspired by the process of natural selection, which iteratively evolves a population of potential solutions towards an optimal configuration. In this context, a "solution" is a specific sequence of tasks for a given Pomodoro session. The primary objective of the GA is to generate a schedule that maximizes a fitness function, which quantifies the quality of a schedule based on task urgency, user performance history, and perceived productivity.


**Chromosomes and Encoding**
Each potential solution (chromosome) is a vector of real-valued priorities in [0,1] (random-keys), one per task. A deterministic decoder maps this vector to a valid schedule by repeatedly selecting, across all sessions, the next feasible task among the heads of each session’s task list based on its priority. This guarantees in-session order while allowing interleaving across sessions.

**Fitness function**
The core of the GA is the fitness function, $F(C)$, which evaluates the viability of each chromosome. The function is formulated as a weighted sum of three key components: an **Urgency Score**, a **Momentum Score**, and a **Variety Score**.

$$F(C) = w_u \cdot S_{urgency}(C) + w_m \cdot S_{momentum}(C) + w_v \cdot S_{variety}(C)$$

Where $w_u$​, $w_m$​, and $w_v$​ are the adaptive weights for urgency, momentum, and variety, respectively.

**Urgency Score ($S_{urgency}$)**
This component measures how well a schedule respects task due dates. It is designed to heavily penalize schedules where tasks are completed after their deadline. The score is calculated based on the total **tardiness** of the schedule.
First, the cumulative completion time, $E_C(t_i)$, for each task in the chromosome $C$ is determined:
$$E_C(t_i) = \sum_{j=1}^i E_t(t_j)$$
where $E_t(t_j)$ is the estimated time to complete task $t_j$.

Next, the tardiness $T_d​(t_i$) for each task is calculated as the amount of time by which its completion exceeds its due date, $D(t_i)$.
	$$T_d(t_i) = \max(0, E_C(t_i) - D(t_i))$$
The total tardiness for the schedule, $T_{total}​(C)$, is the sum of individual task tardiness values.
$$T_{total}(C) = \sum_{i=1}^n T_d(t_i)$$

Finally, the Urgency Score is defined as the reciprocal of the total tardiness, ensuring that the fitness value is maximized when tardiness is minimized. A value of 1 is added to the denominator to prevent division by zero.
$$S_{urgency}(C) = \frac{1}{1 + T_{total}(C)}$$

**Momentum Score ($S_{momentum}$)**
This score promotes schedules that are easier for the user to initiate and adhere to, which is particularly important if the user has a low historical task completion rate. It gives a higher value to schedules that place shorter, less demanding tasks at the beginning of the session.

The score is calculated as a weighted sum, where tasks scheduled earlier in the sequence receive a higher weight.
Raw momentum uses decreasing weights with earlier positions favored:
$$M_{raw}(C) = \sum_{i=1}^n \frac{n-i}{\max(1, E_t(t_i))}$$
We normalize by sequence length as in code:
$$S_{momentum}(C) = \frac{M_{raw}(C)}{n}$$
Here, $(n-i)$ provides the weight, which decreases as the task's position $i$ increases, and durations are clamped to at least 1 minute.

**Variety Score ($S_{variety}$)**
This component addresses the risk of cognitive fatigue by encouraging schedules that vary the cognitive load. It is based on the principle that alternating between long and short tasks can improve focus, a factor that becomes more critical when a user's session feedback indicates frequent distraction.

The score is calculated as the sum of the absolute differences in estimated completion times between adjacent tasks in the schedule.
Raw adjacent-duration differences:
$$V_{raw}(C) = \sum_{i=1}^{n-1} |\max(1, E_t(t_{i+1})) - \max(1, E_t(t_i))|$$
With $e_{max} = \max_i \max(1, E_t(t_i))$ and $n>1$ the normalized score is:
$$S_{variety}(C) = \frac{V_{raw}(C)}{e_{max}(n-1)}$$
A higher score indicates greater variation in task duration throughout the schedule, which is hypothesized to reduce monotony and improve engagement.

**Adaptive Weighting**
The GA "learns" from the user's past behavior by dynamically adjusting the weights ($w_m$​,$w_v$​) of the fitness function based on historical data. The urgency weight ($w_u$​) remains constant, as deadlines are a consistently high priority.
- **Momentum Weight ($w_m$​)**: This weight is inversely proportional to the user's historical task completion rate, $R_{comp}​\in[0,1]$. If the user frequently fails to complete tasks, the system prioritizes building momentum.
$$w_m = k_m \cdot (1 - R_{comp}) \quad (k_m = 1.0)$$
- **Variety Weight ($w_v$​)**: This weight is influenced by the user's average perceived productivity feedback, $\bar{F}$ feedback​. Feedback values are mapped numerically (e.g., HIGHLY_FOCUSED=5, HIGHLY_DISTRACTED=1). If the user reports being distracted, the system prioritizes schedule variety.
$$w_v = k_v \cdot \frac{F_{max} - \bar{F}_{feedback}}{F_{max} - F_{min}} \quad (k_v = 1.0,\ F_{max}=5.0,\ F_{min}=1.0)$$

Set $w_u = 1.0$ (constant) to reflect deadline importance.

Here, $k_m$​ and $k_v$​ are scaling constants, and $F_{max}$​ and $F_{min}$​ are the maximum and minimum possible feedback values, respectively.

**3.5 Genetic Operators (PyGAD)**
The evolution of the population uses PyGAD operators over the priority vectors:
1. **Selection**: Tournament selection (K=4 by default).
2. **Crossover**: Uniform crossover over the random-keys (priority floats).
3. **Mutation**: Random mutation over the random-keys with a small probability (e.g., 0.15).

The decoder enforces feasibility (in-session order) after each genetic operation.