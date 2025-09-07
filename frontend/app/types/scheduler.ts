export interface ScheduledTask {
  id: number;
  name: string;
  estimated_completion_time: number;
  session_id: number;
  category: string;
  due_date?: string;
  completed?: boolean;
  actual_completion_time?: number | null;
}

export interface ScheduleResponse {
  scheduled_tasks: ScheduledTask[];
  total_schedule_time: number;
  fitness_score: number;
}

export interface UserAnalytics {
  completion_rate: number;
  average_focus_level: number;
  estimated_vs_actual_ratio: number;
  category_performance: Record<string, number>;
  time_of_day_performance: Record<string, number>;
}

export interface ScheduleRequest {
  session_ids: number[];
}
