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
  completeTask: (taskId: number) => Promise<void>;
  uncompleteTask: (taskId: number) => Promise<void>;
  completeSessionManually: () => Promise<void>;
  setCurrentSession: (session: Session | null) => void;
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
      set({ sessions });
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
      set({ currentSession: session });
    } catch (error) {
      console.error("Failed to load session:", error);
    } finally {
      set({ isLoading: false });
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
              console.log('Triggering session completion event:', {
                sessionId: updatedSession.id,
                sessionName: updatedSession.name || updatedSession.description,
                totalTasks: updatedSession.tasks.length,
                completedTasks: completedTasksCount,
                focusDuration
              });
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
      console.log('Uncompleting task:', taskId);
      const response = await apiClient.uncompleteTask(taskId) as { message: string; session_reset: boolean };
      console.log('Uncomplete task response:', response);
      
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
          console.log('Session was reset due to uncompleting task');
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
      console.log('Manually triggering session completion event:', {
        sessionId: currentSession.id,
        sessionName: currentSession.name || currentSession.description,
        totalTasks: currentSession.tasks.length,
        completedTasks: completedTasksCount,
        focusDuration
      });
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
}));
