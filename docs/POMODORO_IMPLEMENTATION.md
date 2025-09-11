# Pomodoro Implementation Summary

## Pomodoro States

Pomodoro timer have two distinct states: **short**, and **break**.
Breaks have two different types: **short**, and **long**.

## Pomodoro Timer Setup

Pomodoro timer in the application makes use of the config provided by the session of the current task being worked on.

### Example

Task A is part of Session X
Session X pomodoro config: {
focus_duration: 25,
short_break_duration: 5,
long_break_duration: 20,
long_break_per_pomodoros: 4
}

Pomodoro timer will use the config of session X if the current task is A

## Schedules

Schedules are composed of tasks from different sessions.

### Example

Sessions X Tasks: A, B, C
Sessions Y Tasks: D, E

Schedule: E, A, D, B, C

The pomodoro timer will use the config of the current task. Thus, in the example the first task is **E** so it will use the pomodoro config from Session X. After finishing E A comes next, and it will now use the pomodoro config from session Y.

## Counting Pomodoros

To count pomodoros you just have to count completed focus phase by the user.
