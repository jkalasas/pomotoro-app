import { create } from "zustand";
import { apiClient } from "~/lib/api";

export interface Session {
  id: number;
  name: string;
  description: string;
  focus_duration: number;
  short_break_duration: number;
  long_break_duration: number;
  long_break_per_pomodoros: number;
}

export interface SessionsState {
  sessions: Session[];
  isLoading: boolean;
  loadSessions: () => Promise<void>;
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
  }) => Promise<void>;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  isLoading: false,

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = (await apiClient.getSessions()) as Session[];
      set({ sessions });
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  createSession: async (sessionData) => {
    set({ isLoading: true });
    try {
      await apiClient.createSession(sessionData);
      await get().loadSessions(); // Reload sessions after creating
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      set({ isLoading: false });
    }
  },
}));
