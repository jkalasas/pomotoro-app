## Genetic Algorithm
To address the task scheduling problem, a Genetic Algorithm (GA) is employed. The GA is a metaheuristic inspired by the process of natural selection, which iteratively evolves a population of potential solutions towards an optimal configuration. In this context, a "solution" is a specific sequence of tasks for a given Pomodoro session. The primary objective of the GA is to generate a schedule that maximizes a fitness function, which quantifies the quality of a schedule based on task urgency, user performance history, and perceived productivity.


**Chromosomes**
Each potential solution, or **chromosome**, in the GA population represents a unique task schedule. A chromosome is defined as an ordered vector of tasks for the session.

Given a set of n tasks $T={t_1​,t_2​,...,t_n​}$ generated for a session, a chromosome C is a permutation of these tasks:
$$C = [t_1, t_2, ..., t_n]$$

**Fitness function**
The core of the GA is the fitness function, $F(C)$, which evaluates the viability of each chromosome. The function is formulated as a weighted sum of three key components: an **Urgency Score**, a **Momentum Score**, and a **Variety Score**.

$$F(C) = w_u \cdot S_{urgency}(C) + w_m \cdot S_{momentum}(C) + w_v \cdot S_{variety}(C)$$

Where $w_u$​, $w_m$​, and $w_v$​ are the adaptive weights for urgency, momentum, and variety, respectively.

**Urgency Score ($S_{urgency}$)**
This component measures how well a schedule respects task due dates. It is designed to heavily penalize schedules where tasks are completed after their deadline. The score is calculated based on the total **tardiness** of the schedule.
First, the scheduled completion time, $E_c​(t_i​)$, for each task in the chromosome $C$ is determined:
$$E_c(t_i) = \sum_{j=1}^i E_i(t_j)$$
where $E_t​(t_j)$ is the estimated time to complete task $t_j$.

Next, the tardiness $T_d​(t_i$) for each task is calculated as the amount of time by which its completion exceeds its due date, $D(t_i)$.
	$$T_d(t_i) = max(0, E_C(t_i) - D(t_i))$$
The total tardiness for the schedule, $T_{total}​(C)$, is the sum of individual task tardiness values.
$$T_{total}(C) = \sum_{i=1}^n T_d(t_i)$$

Finally, the Urgency Score is defined as the reciprocal of the total tardiness, ensuring that the fitness value is maximized when tardiness is minimized. A value of 1 is added to the denominator to prevent division by zero.
$$S_{urgency}(C) = \frac{1}{1 + T_{total}(C)}$$

**Momentum Score ($S_{momentum}$)**
This score promotes schedules that are easier for the user to initiate and adhere to, which is particularly important if the user has a low historical task completion rate. It gives a higher value to schedules that place shorter, less demanding tasks at the beginning of the session.

The score is calculated as a weighted sum, where tasks scheduled earlier in the sequence receive a higher weight.
$$S_{momentum}(C) = \sum_{i=1}^n \frac{n-i+1}{E_t(t_i)}$$
Here, $(n−i+1)$ provides the weight, which decreases as the task's position i increases. This is divided by the task's estimated completion time $E_t​(t_i​)$, thus rewarding the early placement of shorter tasks.

**Variety Score ($S_{variety})$**
This component addresses the risk of cognitive fatigue by encouraging schedules that vary the cognitive load. It is based on the principle that alternating between long and short tasks can improve focus, a factor that becomes more critical when a user's session feedback indicates frequent distraction.

The score is calculated as the sum of the absolute differences in estimated completion times between adjacent tasks in the schedule.
$$S_{variety}(C) = \sum_{i=1}^{n-1} |E_t(t_{i+1}) - E_t(t(i)|$$
A higher score indicates greater variation in task duration throughout the schedule, which is hypothesized to reduce monotony and improve engagement.

**Adaptive Weighting**
The GA "learns" from the user's past behavior by dynamically adjusting the weights ($w_m$​,$w_v$​) of the fitness function based on historical data. The urgency weight ($w_u$​) remains constant, as deadlines are a consistently high priority.
- **Momentum Weight ($w_m$​)**: This weight is inversely proportional to the user's historical task completion rate, $R_{comp}​\in[0,1]$. If the user frequently fails to complete tasks, the system prioritizes building momentum.
$$w_m = k_m \cdot (1 - R_{comp}) $$
- **Variety Weight ($w_v$​)**: This weight is influenced by the user's average perceived productivity feedback, $\bar{F}$ feedback​. Feedback values are mapped numerically (e.g., HIGHLY_FOCUSED=5, HIGHLY_DISTRACTED=1). If the user reports being distracted, the system prioritizes schedule variety.
$$w_v = k_v * (\frac{F_{max} - \bar{F}_{feedback}}{F_{max} - F_{min}})$$

Here, $k_m$​ and $k_v$​ are scaling constants, and $F_{max}$​ and $F_{min}$​ are the maximum and minimum possible feedback values, respectively.

**3.5 Genetic Operators**
The evolution of the population is driven by three primary genetic operators:
1. **Selection**: A **Tournament Selection** mechanism is used. A small subset of chromosomes is randomly selected from the population, and the chromosome with the highest fitness value within that subset is chosen to be a parent for the next generation. This process is repeated to select two parents.
2. **Crossover**: To create offspring from two parent chromosomes, **Order Crossover (OX1)** is applied. A random sub-sequence from one parent is copied to the child. The remaining tasks are then filled in from the second parent in the order they appear, without duplicating any tasks already present from the first parent. This ensures that the resulting offspring are valid permutations.
3. **Mutation**: A **Swap Mutation** operator is used to introduce new genetic material and prevent premature convergence. Two distinct positions in a chromosome are randomly selected, and the tasks at these positions are swapped. This is applied with a low probability to each chromosome in the new generation.