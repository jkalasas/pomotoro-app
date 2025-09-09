import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "~/lib/api";
import { toast } from "sonner";
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
      // and normalize empty names to a safe default
      const visibleTasks = response.scheduled_tasks
        .filter(t => !t.archived)
        .map(t => ({ ...t, name: (t.name || '').trim() || 'Untitled Task' }));
      set({
        currentSchedule: visibleTasks,
        totalScheduleTime: response.total_schedule_time,
        fitnessScore: response.fitness_score,
        selectedSessionIds: sessionIds,
        isLoading: false,
      });

      // Update Pomodoro settings to reflect the first task's session of the new schedule
      try {
        const firstTask = visibleTasks.find(t => !t.completed);
        if (firstTask) {
          const { usePomodoroStore } = await import('./pomodoro');
          const pomodoroStore = usePomodoroStore.getState();

          const isRunning = pomodoroStore.isRunning;
          const currentPhase = pomodoroStore.phase;
          const remainingTime = pomodoroStore.time; // seconds
          const prevFocusSeconds = pomodoroStore.settings.focus_duration * 60;

          // Don't automatically switch the backend session - just update the current task
          // and let the pomodoro store handle the configuration based on the current task
          if (!isRunning) {
            // When timer is not running, we can safely update the current task
            await pomodoroStore.updateTimer({ current_task_id: firstTask.id, is_running: false });
          } else {
            // Timer running: update task and sync settings, apply reset rules and keep running
            await pomodoroStore.updateSettingsFromTask(firstTask.session_id);
            const nextFocusSeconds = usePomodoroStore.getState().settings.focus_duration * 60;

            if (currentPhase === 'focus') {
              const mustReset = remainingTime === prevFocusSeconds || remainingTime > nextFocusSeconds;
              const newRemaining = mustReset ? nextFocusSeconds : Math.min(remainingTime, nextFocusSeconds);
              // Instantly reflect locally
              usePomodoroStore.setState({ maxTime: nextFocusSeconds, time: newRemaining, currentTaskId: firstTask.id });
              await pomodoroStore.updateTimer({
                current_task_id: firstTask.id,
                phase: 'focus',
                time_remaining: newRemaining,
                is_running: true,
              });
            } else {
              // During breaks, keep remaining time; still set the current task id for UI consistency
              usePomodoroStore.setState({ currentTaskId: firstTask.id });
              await pomodoroStore.updateTimer({ current_task_id: firstTask.id, is_running: true });
            }
          }
          
          // Always sync config with current task after schedule generation
          await pomodoroStore.syncConfigWithCurrentTask();
        }
      } catch (syncErr) {
        // Don't block schedule creation if timer sync fails
        console.error('Failed to sync Pomodoro with new schedule:', syncErr);
      }
      
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
  const wasRunning = pomodoroStore.isRunning;
  const prevPhase = pomodoroStore.phase;
  const prevRemaining = pomodoroStore.time; // seconds
  const prevFocusSeconds = pomodoroStore.settings.focus_duration * 60;
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
        name: (task.name || '').trim() || 'Untitled Task',
        completed: completionStatusMap.get(task.id) || false
      }));
      
      // Update the schedule with the corrected response
      set({ 
        currentSchedule: correctedTasks,
        totalScheduleTime: response.total_schedule_time,
        fitnessScore: response.fitness_score
      });
      
      // Decide how to update timer/config based on new first task and rules
      if (newFirstTask) {
        try {
          // Always adopt the session config of the new first (latest/next) task
          await pomodoroStore.updateSettingsFromTask(newFirstTask.session_id);

          // Compute new focus seconds for comparisons
          const newFocusSeconds = usePomodoroStore.getState().settings.focus_duration * 60;

          // If we're in focus phase and switching active task, decide if we must reset
          const switchingTask = currentTaskId !== null && currentTaskId !== newFirstTask.id;
          const mustResetFocus = prevPhase === 'focus' && switchingTask && (
            prevRemaining === prevFocusSeconds || // equal to previous session max
            prevRemaining > newFocusSeconds       // greater than new session max
          );

          if (prevPhase === 'focus') {
            // Keep timer running during switch if it was running
            if (mustResetFocus) {
              // Reflect new config instantly
              usePomodoroStore.setState({ maxTime: newFocusSeconds, time: newFocusSeconds, currentTaskId: newFirstTask.id });
              await pomodoroStore.updateTimer({
                current_task_id: newFirstTask.id,
                phase: 'focus',
                time_remaining: newFocusSeconds,
                is_running: wasRunning || wasTimerRunning,
              });
            } else {
              // If remaining time exceeds new max but we didn't detect switch (edge), clamp
              const clamped = Math.min(prevRemaining, newFocusSeconds);
              usePomodoroStore.setState({ maxTime: newFocusSeconds, time: clamped, currentTaskId: newFirstTask.id });
              await pomodoroStore.updateTimer({
                current_task_id: newFirstTask.id,
                time_remaining: clamped,
                is_running: wasRunning || wasTimerRunning,
              });
            }
          } else {
            // During breaks, just update the current task id and keep running state
            usePomodoroStore.setState({ currentTaskId: newFirstTask.id });
            await pomodoroStore.updateTimer({
              current_task_id: newFirstTask.id,
              is_running: wasRunning || wasTimerRunning,
            });
          }
        } catch (e) {
          // Best-effort: at least point timer to the new current task
          await pomodoroStore.updateTimer({ current_task_id: newFirstTask.id, is_running: wasRunning || wasTimerRunning });
        }
      }
    } catch (error) {
      console.error("Failed to reorder schedule:", error);
      set({ error: error instanceof Error ? error.message : "Failed to reorder schedule" });
      // Fallback to local reordering if API fails
      set({ currentSchedule: reorderedTasks });
    }
  },

  completeScheduledTask: async (taskId: number) => {
    // Optimistic update
    const prevSchedule = get().currentSchedule;
    if (prevSchedule) {
      const optimistic = prevSchedule.map(t => t.id === taskId ? { ...t, completed: true } : t);
      set({ currentSchedule: optimistic });
    }

    try {
      // Delegate to tasks store for unified behavior (analytics, events, feedback, data refresh)
      const { useTaskStore } = await import('./tasks');
      await useTaskStore.getState().completeTask(taskId);

      // Sync pomodoro config with the new current task after completion
      try {
        const { usePomodoroStore } = await import('./pomodoro');
        await usePomodoroStore.getState().syncConfigWithCurrentTask();
      } catch (syncError) {
        // Don't block task completion if sync fails
      }

      toast.success('Task completed');
    } catch (error) {
      // Rollback on failure
      if (prevSchedule) set({ currentSchedule: prevSchedule });
      console.error("Failed to complete task:", error);
      set({ error: error instanceof Error ? error.message : "Failed to complete task" });
      toast.error('Failed to complete task');
    }
  },

  uncompleteScheduledTask: async (taskId: number) => {
    // Optimistic update
    const prevSchedule = get().currentSchedule;
    if (prevSchedule) {
      const optimistic = prevSchedule.map(t => t.id === taskId ? { ...t, completed: false } : t);
      set({ currentSchedule: optimistic });
    }

    try {
      // Delegate to tasks store (handles analytics, potential session reset, and data refresh)
      const { useTaskStore } = await import('./tasks');
      await useTaskStore.getState().uncompleteTask(taskId);

      toast.success('Task marked incomplete');
    } catch (error) {
      // Rollback on failure
      if (prevSchedule) set({ currentSchedule: prevSchedule });
      console.error("Failed to uncomplete task:", error);
      set({ error: error instanceof Error ? error.message : "Failed to uncomplete task" });
      toast.error('Failed to mark task incomplete');
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
