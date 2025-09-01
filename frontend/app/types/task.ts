export enum TaskDifficulty {
    EASY = "EASY",
    MEDIUM = "MEDIUM",
    HARD = "HARD",
}

export interface Task {
    id: string;
    name: string;
    description?: string;
    difficulty: TaskDifficulty;
    pomodoros: number;
    subtasks?: Task[];
}
