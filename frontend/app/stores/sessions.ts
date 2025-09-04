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
  completed?: boolean;
  completed_at?: string;
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
  completeSession: (sessionId: number, focusLevel: string, reflection?: string) => Promise<void>;
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

  completeSession: async (sessionId, focusLevel, reflection) => {
    set({ isLoading: true });
    try {
      await apiClient.completeSession(sessionId, focusLevel, reflection);
      // Update the local session state
      set((state) => ({
        sessions: state.sessions.map(session =>
          session.id === sessionId
            ? { ...session, completed: true, completed_at: new Date().toISOString() }
            : session
        ),
      }));
    } catch (error) {
      console.error("Failed to complete session:", error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
}));
