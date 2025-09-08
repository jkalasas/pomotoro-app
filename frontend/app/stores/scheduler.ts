import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "~/lib/api";
import type { ScheduledTask, ScheduleResponse, UserAnalytics } from "~/types/scheduler";

interface SchedulerState {
  currentSchedule: ScheduledTask[] | null;
  selectedSessionIds: number[];
  totalScheduleTime: number;
  fitnessScore: number;
  userAnalytics: UserAnalytics | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setSelectedSessions: (sessionIds: number[]) => void;
  generateSchedule: (sessionIds: number[]) => Promise<void>;
  clearSchedule: () => void;
  reorderSchedule: (reorderedTasks: ScheduledTask[]) => void;
  reorderScheduleWithTimerReset: (reorderedTasks: ScheduledTask[], wasTimerRunning: boolean) => void;
  completeScheduledTask: (taskId: number) => Promise<void>;
  uncompleteScheduledTask: (taskId: number) => Promise<void>;
  loadUserAnalytics: () => Promise<void>;
  updateDailyStats: () => Promise<void>;
  
  // Helper methods for pomodoro integration
  getCurrentTask: () => ScheduledTask | null;
  getNextTask: () => ScheduledTask | null;
  hasActiveTasks: () => boolean;
}

export const useSchedulerStore = create<SchedulerState>()(
  persist(
    (set, get) => ({
  currentSchedule: null,
  selectedSessionIds: [],
  totalScheduleTime: 0,
  fitnessScore: 0,
  userAnalytics: null,
  isLoading: false,
  error: null,

  setSelectedSessions: (sessionIds: number[]) => {
    set({ selectedSessionIds: sessionIds });
  },

  generateSchedule: async (sessionIds: number[]) => {
    set({ isLoading: true, error: null });
    
    // Import analytics store
    const { useAnalyticsStore } = await import('./analytics');
    const analyticsStore = useAnalyticsStore.getState();
    
    try {
      const response = await apiClient.generateSchedule(sessionIds) as ScheduleResponse;
      // Filter out archived tasks defensively (backend exclusion) 
      const visibleTasks = response.scheduled_tasks.filter(t => !t.archived);
      set({
        currentSchedule: visibleTasks,
        totalScheduleTime: response.total_schedule_time,
        fitnessScore: response.fitness_score,
        selectedSessionIds: sessionIds,
        isLoading: false,
      });
      
      // Log successful schedule generation
      analyticsStore.logScheduleGeneration(
        response.scheduled_tasks.length,
        response.total_schedule_time,
        true
      );
    } catch (error) {
      console.error("Failed to generate schedule:", error);
      
      // Import analytics store for error logging
      const { useAnalyticsStore } = await import('./analytics');
      const analyticsStore = useAnalyticsStore.getState();
      
      // Log failed schedule generation
      analyticsStore.logScheduleGeneration(0, 0, false);
      
      set({
        error: error instanceof Error ? error.message : "Failed to generate schedule",
        isLoading: false,
      });
    }
  },

  clearSchedule: () => {
    set({
      currentSchedule: null,
      selectedSessionIds: [],
      totalScheduleTime: 0,
      fitnessScore: 0,
      error: null,
    });
  },

  reorderSchedule: (reorderedTasks: ScheduledTask[]) => {
    set({ currentSchedule: reorderedTasks });
  },

  reorderScheduleWithTimerReset: async (reorderedTasks: ScheduledTask[], wasTimerRunning: boolean) => {
    try {
      // Import the pomodoro store dynamically to avoid circular dependency
      const { usePomodoroStore } = await import('./pomodoro');
      const pomodoroStore = usePomodoroStore.getState();
      
      // Get the currently active task from the timer (not just first uncompleted)
      const currentTaskId = pomodoroStore.currentTaskId;
      const newFirstTask = reorderedTasks.find(task => !task.completed);
      
      // Create a map to preserve completion status
      const completionStatusMap = new Map<number, boolean>();
      reorderedTasks.forEach(task => {
        completionStatusMap.set(task.id, task.completed || false);
      });
      
      // Call the backend API to persist the reordered schedule
      const taskIds = reorderedTasks.map(task => task.id);
      const response = await apiClient.reorderSchedule(taskIds) as ScheduleResponse;
      
      // Preserve the completion status from before the reorder operation
      const correctedTasks = response.scheduled_tasks.map(task => ({
        ...task,
        completed: completionStatusMap.get(task.id) || false
      }));
      
      // Update the schedule with the corrected response
      set({ 
        currentSchedule: correctedTasks,
        totalScheduleTime: response.total_schedule_time,
        fitnessScore: response.fitness_score
      });
      
      // Only reset timer if:
      // 1. Timer was running on a specific task, AND
      // 2. The active task changes (different first uncompleted), AND
      // 3. The focus duration of the new task's session is LESS than the remaining time
      let shouldResetTimer = false;
      if (wasTimerRunning && currentTaskId !== null && newFirstTask && currentTaskId !== newFirstTask.id) {
        try {
          // Fetch session to determine its focus duration
            const session = await apiClient.getSession(newFirstTask.session_id) as { focus_duration: number };
            const remainingTime = pomodoroStore.time; // seconds
            if (session.focus_duration * 60 < remainingTime) {
              shouldResetTimer = true;
            }
        } catch (e) {
          // If we fail to fetch session data, be conservative: do NOT reset
          shouldResetTimer = false;
        }
      }

      if (shouldResetTimer) {
        await pomodoroStore.resetTimer();
        await pomodoroStore.startTimer();
      }
    } catch (error) {
      console.error("Failed to reorder schedule:", error);
      set({ error: error instanceof Error ? error.message : "Failed to reorder schedule" });
      // Fallback to local reordering if API fails
      set({ currentSchedule: reorderedTasks });
    }
  },

  completeScheduledTask: async (taskId: number) => {
    try {
      await apiClient.completeTask(taskId);
      
      // Handle next task transition for pomodoro configuration updates
      const { useTaskStore } = await import('./tasks');
      await useTaskStore.getState().handleNextTaskTransition(taskId);
      
  const currentSchedule = get().currentSchedule?.filter(t => !t.archived) || null;
      if (currentSchedule) {
        const updatedSchedule = currentSchedule.map(task =>
          task.id === taskId ? { ...task, completed: true } : task
        );
        set({ currentSchedule: updatedSchedule });
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
      set({ error: error instanceof Error ? error.message : "Failed to complete task" });
    }
  },

  uncompleteScheduledTask: async (taskId: number) => {
    try {
      await apiClient.uncompleteTask(taskId);
      
  const currentSchedule = get().currentSchedule?.filter(t => !t.archived) || null;
      if (currentSchedule) {
        const updatedSchedule = currentSchedule.map(task =>
          task.id === taskId ? { ...task, completed: false } : task
        );
        set({ currentSchedule: updatedSchedule });
      }
    } catch (error) {
      console.error("Failed to uncomplete task:", error);
      set({ error: error instanceof Error ? error.message : "Failed to uncomplete task" });
    }
  },

  loadUserAnalytics: async () => {
    set({ isLoading: true });
    try {
      const analytics = await apiClient.getUserInsights() as UserAnalytics;
      set({ userAnalytics: analytics, isLoading: false });
    } catch (error) {
      console.error("Failed to load user analytics:", error);
      set({
        error: error instanceof Error ? error.message : "Failed to load analytics",
        isLoading: false,
      });
    }
  },

  updateDailyStats: async () => {
    try {
      await apiClient.updateDailyStats();
    } catch (error) {
      console.error("Failed to update daily stats:", error);
    }
  },

  // Helper methods for pomodoro integration
  getCurrentTask: (): ScheduledTask | null => {
  const currentSchedule = get().currentSchedule?.filter(t => !t.archived) || null;
    if (!currentSchedule) return null;
    
    // Return the first uncompleted task
    return currentSchedule.find(task => !task.completed) || null;
  },

  getNextTask: (): ScheduledTask | null => {
  const currentSchedule = get().currentSchedule?.filter(t => !t.archived) || null;
    if (!currentSchedule) return null;
    
    const incompleteTasks = currentSchedule.filter(task => !task.completed);
    return incompleteTasks.length > 1 ? incompleteTasks[1] : null;
  },

  hasActiveTasks: (): boolean => {
  const currentSchedule = get().currentSchedule?.filter(t => !t.archived) || null;
  return !!(currentSchedule && currentSchedule.some(task => !task.completed));
  },
}),
{
  name: "scheduler-storage",
  partialize: (state) => ({
    currentSchedule: state.currentSchedule,
    selectedSessionIds: state.selectedSessionIds,
    totalScheduleTime: state.totalScheduleTime,
    fitnessScore: state.fitnessScore,
  }),
}
));
