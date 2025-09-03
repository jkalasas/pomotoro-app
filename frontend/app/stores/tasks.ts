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
  tasks: Task[];
}

interface TaskState {
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
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
  updateSession: (sessionId: number, updates: { name?: string; description?: string }) => Promise<void>;
  completeTask: (taskId: number) => Promise<void>;
  setCurrentSession: (session: Session | null) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  sessions: [],
  currentSession: null,
  isLoading: false,

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
        await get().loadSession(currentSession.id);
      }
      
      // Refresh daily progress after completing a task
      // Import and call the daily progress refresh function
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('task-completed'));
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
      throw error;
    }
  },

  setCurrentSession: (session: Session | null) => set({ currentSession: session }),
}));
