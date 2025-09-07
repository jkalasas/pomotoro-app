import { create } from "zustand";
import { apiClient } from "~/lib/api";
import { useAnalyticsStore } from "./analytics";

export interface Task {
  id: number;
  name: string;
  estimated_completion_time: number;
  category: string;
  completed: boolean;
  actual_completion_time: number | null;
}

export interface Session {
  id: number;
  name: string;
  description: string;
  focus_duration: number;
  short_break_duration: number;
  long_break_duration: number;
  long_break_per_pomodoros: number;
  completed?: boolean;
  completed_at?: string;
  tasks: Task[];
}

interface TaskState {
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  refreshAllData: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadSession: (sessionId: number) => Promise<void>;
  getSession: (sessionId: number) => Promise<Session>;
  createSession: (sessionData: {
    description: string;
    pomodoro_config: {
      focus_duration: number;
      short_break_duration: number;
      long_break_duration: number;
      long_break_per_pomodoros: number;
    };
    tasks: Array<{
      name: string;
      category: string;
      estimated_completion_time: number;
    }>;
  }) => Promise<Session>;
  updateSession: (sessionId: number, updates: { 
    name?: string; 
    description?: string;
    focus_duration?: number;
    short_break_duration?: number;
    long_break_duration?: number;
    long_break_per_pomodoros?: number;
  }) => Promise<void>;
  deleteSession: (sessionId: number) => Promise<void>;
  completeTask: (taskId: number) => Promise<void>;
  uncompleteTask: (taskId: number) => Promise<void>;
  completeSessionManually: () => Promise<void>;
  setCurrentSession: (session: Session | null) => void;
  // Task management methods
  addTaskToSession: (sessionId: number, taskData: {
    name: string;
    category: string;
    estimated_completion_time: number;
  }) => Promise<void>;
  updateTask: (taskId: number, taskData: {
    name?: string;
    category?: string;
    estimated_completion_time?: number;
  }) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  reorderTasks: (sessionId: number, taskIds: number[]) => Promise<void>;
  // New method for handling next task with pomodoro config updates
  handleNextTaskTransition: (completedTaskId: number) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  sessions: [],
  currentSession: null,
  isLoading: false,

  // Helper function to refresh all relevant data
  refreshAllData: async () => {
    const currentSessionId = get().currentSession?.id;
    await get().loadSessions();
    if (currentSessionId) {
      await get().loadSession(currentSessionId);
    }
  },

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await apiClient.getSessions() as Session[];
      // Ensure all sessions have a tasks array
      const sessionsWithTasks = sessions.map(session => ({
        ...session,
        tasks: session.tasks || []
      }));
      set({ sessions: sessionsWithTasks });
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadSession: async (sessionId: number) => {
    set({ isLoading: true });
    try {
      const session = await apiClient.getSession(sessionId) as Session;
      // Ensure session has a tasks array
      const sessionWithTasks = {
        ...session,
        tasks: session.tasks || []
      };
      set({ currentSession: sessionWithTasks });
    } catch (error) {
      console.error("Failed to load session:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  getSession: async (sessionId: number) => {
    try {
      const session = await apiClient.getSession(sessionId) as Session;
      // Ensure session has a tasks array
      return {
        ...session,
        tasks: session.tasks || []
      };
    } catch (error) {
      console.error("Failed to get session:", error);
      throw error;
    }
  },

  createSession: async (sessionData) => {
    set({ isLoading: true });
    try {
      const session = await apiClient.createSession(sessionData) as Session;
      await get().loadSessions(); // Refresh sessions list
      return session;
    } catch (error) {
      console.error("Failed to create session:", error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  updateSession: async (sessionId: number, updates) => {
    set({ isLoading: true });
    try {
      await apiClient.updateSession(sessionId, updates);
      await get().loadSessions(); // Refresh sessions list
      // If this is the current session, reload it
      const currentSession = get().currentSession;
      if (currentSession && currentSession.id === sessionId) {
        await get().loadSession(sessionId);
      }
    } catch (error) {
      console.error("Failed to update session:", error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  completeTask: async (taskId: number) => {
    try {
      await apiClient.completeTask(taskId);
      
      // Handle next task transition for pomodoro configuration updates
      await get().handleNextTaskTransition(taskId);
      
      // Get task details for analytics logging
      const currentSession = get().currentSession;
      const task = currentSession?.tasks.find(t => t.id === taskId);
      
      if (task && currentSession) {
        // Log task completion analytics
        useAnalyticsStore.getState().logTaskComplete(taskId, task.name, currentSession.id);
      }
      
      // Refresh current session to get updated task status
      if (currentSession) {
        await get().refreshAllData();
        
        // Check if all tasks are completed after refreshing
        const updatedSession = get().currentSession;
        if (updatedSession) {
          const allTasksCompleted = updatedSession.tasks.every(t => t.completed);
          const completedTasksCount = updatedSession.tasks.filter(t => t.completed).length;
          
          if (allTasksCompleted && completedTasksCount > 0) {
            // Trigger session completion feedback modal
            const focusDuration = Math.floor(
              updatedSession.tasks.reduce((sum, t) => sum + (t.actual_completion_time || t.estimated_completion_time), 0) / 60
            );
            
            // Trigger session completion via custom event
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent('session-completion', {
                detail: {
                  sessionId: updatedSession.id,
                  sessionName: updatedSession.name || updatedSession.description,
                  totalTasks: updatedSession.tasks.length,
                  completedTasks: completedTasksCount,
                  focusDuration
                }
              }));
            }
          }
        }
      }
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('task-completed'));
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
      throw error;
    }
  },

  uncompleteTask: async (taskId: number) => {
    try {
      const response = await apiClient.uncompleteTask(taskId) as { message: string; session_reset: boolean };
      
      // Get task details for analytics logging
      const currentSession = get().currentSession;
      const task = currentSession?.tasks.find(t => t.id === taskId);
      
      if (task && currentSession) {
        // Log task uncompletion analytics
        useAnalyticsStore.getState().logTaskUncomplete(
          taskId, 
          task.name, 
          currentSession.id, 
          response.session_reset
        );
        
        // If session was reset, log that too
        if (response.session_reset) {
          useAnalyticsStore.getState().logSessionReset(
            currentSession.id,
            "task_uncompleted"
          );
        }
      }
      
      // Refresh current session to get updated task status
      if (currentSession) {
        await get().refreshAllData();
        
        // Check if session was reset due to uncompleting the task
        if (response.session_reset) {
          // Session was reset, need to reload pomodoro state
          // Dispatch event to notify other parts of the app
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('session-reset', {
              detail: { sessionId: currentSession.id, taskId }
            }));
          }
        }
      }
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('task-uncompleted'));
      }
    } catch (error) {
      console.error("Failed to uncomplete task:", error);
      throw error;
    }
  },

  completeSessionManually: async () => {
    const currentSession = get().currentSession;
    if (!currentSession) {
      throw new Error("No active session to complete");
    }

    const completedTasksCount = currentSession.tasks.filter(t => t.completed).length;
    const focusDuration = Math.floor(
      currentSession.tasks.reduce((sum, t) => sum + (t.actual_completion_time || t.estimated_completion_time), 0) / 60
    );
    
    // Trigger session completion via custom event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('session-completion', {
        detail: {
          sessionId: currentSession.id,
          sessionName: currentSession.name || currentSession.description,
          totalTasks: currentSession.tasks.length,
          completedTasks: completedTasksCount,
          focusDuration
        }
      }));
    }
  },

  setCurrentSession: (session: Session | null) => set({ currentSession: session }),

  deleteSession: async (sessionId: number) => {
    try {
      await apiClient.deleteSession(sessionId);
      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter(session => session.id !== sessionId),
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
      }));
    } catch (error) {
      console.error("Failed to delete session:", error);
      throw error;
    }
  },

  addTaskToSession: async (sessionId: number, taskData) => {
    try {
      const newTask = await apiClient.addTaskToSession(sessionId, taskData) as Task;
      // Update the local state by adding the task to the session
      set((state) => ({
        sessions: state.sessions.map(session =>
          session.id === sessionId
            ? { ...session, tasks: [...(session.tasks || []), newTask] }
            : session
        ),
        currentSession: state.currentSession?.id === sessionId
          ? { ...state.currentSession, tasks: [...(state.currentSession.tasks || []), newTask] }
          : state.currentSession,
      }));
    } catch (error) {
      console.error("Failed to add task:", error);
      throw error;
    }
  },

  updateTask: async (taskId: number, taskData) => {
    try {
      const updatedTask = await apiClient.updateTask(taskId, taskData) as Task;
      // Update the local state
      set((state) => ({
        sessions: state.sessions.map(session => ({
          ...session,
          tasks: (session.tasks || []).map(task =>
            task.id === taskId ? updatedTask : task
          ),
        })),
        currentSession: state.currentSession ? {
          ...state.currentSession,
          tasks: (state.currentSession.tasks || []).map(task =>
            task.id === taskId ? updatedTask : task
          ),
        } : null,
      }));
    } catch (error) {
      console.error("Failed to update task:", error);
      throw error;
    }
  },

  deleteTask: async (taskId: number) => {
    try {
      await apiClient.deleteTask(taskId);
      // Remove from local state
      set((state) => ({
        sessions: state.sessions.map(session => ({
          ...session,
          tasks: (session.tasks || []).filter(task => task.id !== taskId),
        })),
        currentSession: state.currentSession ? {
          ...state.currentSession,
          tasks: (state.currentSession.tasks || []).filter(task => task.id !== taskId),
        } : null,
      }));
    } catch (error) {
      console.error("Failed to delete task:", error);
      throw error;
    }
  },

  reorderTasks: async (sessionId: number, taskIds) => {
    try {
      await apiClient.reorderTasks(sessionId, taskIds);
      // Update the local state to reflect the new order
      set((state) => ({
        sessions: state.sessions.map(session => {
          if (session.id === sessionId && session.tasks) {
            const taskMap = new Map(session.tasks.map(task => [task.id, task]));
            const reorderedTasks = taskIds.map(id => taskMap.get(id)).filter(Boolean) as Task[];
            return { ...session, tasks: reorderedTasks };
          }
          return session;
        }),
        currentSession: state.currentSession?.id === sessionId && state.currentSession?.tasks ? (() => {
          const taskMap = new Map(state.currentSession.tasks.map(task => [task.id, task]));
          const reorderedTasks = taskIds.map(id => taskMap.get(id)).filter(Boolean) as Task[];
          return { ...state.currentSession, tasks: reorderedTasks };
        })() : state.currentSession,
      }));
    } catch (error) {
      console.error("Failed to reorder tasks:", error);
      throw error;
    }
  },

  // New method for handling next task with pomodoro config updates
  handleNextTaskTransition: async (completedTaskId: number) => {
    try {
      const { usePomodoroStore } = await import('./pomodoro');
      const { useSchedulerStore } = await import('./scheduler');
      
      // Get the current schedule to find next task
      const schedulerState = useSchedulerStore.getState();
      const currentSchedule = schedulerState.currentSchedule;
      
      if (!currentSchedule) {
        return;
      }
      
      // Find the completed task and the next task
      const completedTaskIndex = currentSchedule.findIndex(task => task.id === completedTaskId);
      const nextTask = currentSchedule.find((task, index) => 
        index > completedTaskIndex && !task.completed
      );
      
      if (!nextTask) {
        return;
      }
      
      // Get the current pomodoro state BEFORE any updates
      const pomodoroStore = usePomodoroStore.getState();
      const currentTime = pomodoroStore.time;
      const currentPhase = pomodoroStore.phase;
      const isRunning = pomodoroStore.isRunning;
      const currentTimeRemaining = pomodoroStore.time; // This is the actual remaining time
      
      // Get the current and next task sessions
      const completedTask = currentSchedule[completedTaskIndex];
      const currentSessionId = completedTask?.session_id;
      const nextSessionId = nextTask.session_id;
      
      // If timer is running, preserve the current time regardless of session changes
      if (isRunning && currentPhase === "focus") {
        // Only update the current task, preserving the timer state
        await pomodoroStore.updateTimer({
          current_task_id: nextTask.id,
          is_running: true, // Keep timer running
          // Do NOT update time_remaining - let it preserve the current countdown
        });
        
        // If session changed, update settings silently without affecting the timer
        if (currentSessionId !== nextSessionId) {
          // Update settings in the background for future timer resets, but don't affect current timer
          await pomodoroStore.updateSettingsFromTask(nextSessionId);
        }
      } else {
        // Timer is not running or not in focus phase, handle normally
        
        // If the next task is from a different session, update pomodoro configuration
        if (currentSessionId !== nextSessionId) {
          await pomodoroStore.updateSettingsFromTask(nextSessionId);
          
          // Get the updated settings after updateSettingsFromTask
          const updatedSettings = usePomodoroStore.getState().settings;
          const newFocusDuration = updatedSettings.focus_duration * 60; // Convert to seconds
          
          // For non-running timer, use new focus duration
          await pomodoroStore.updateTimer({
            time_remaining: newFocusDuration,
            current_task_id: nextTask.id,
            is_running: false,
          });
        } else {
          // Same session, just update the current task
          await pomodoroStore.updateTimer({
            current_task_id: nextTask.id,
            is_running: false,
          });
        }
      }
    } catch (error) {
      // Failed to handle next task transition
    }
  },
}));
