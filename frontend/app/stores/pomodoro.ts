import { create } from "zustand";
import { apiClient } from "~/lib/api";

export interface PomodoroState {
  time: number;
  maxTime: number;
  isRunning: boolean;
  phase: string;
  currentTaskId: number | null;
  sessionId: number | null;
  pomodorosCompleted: number;
  isLoading: boolean;
  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  setTime: (time: number) => void;
  setMaxTime: (maxTime: number) => void;
  setSession: (sessionId: number) => Promise<void>;
  loadActiveSession: () => Promise<void>;
  updateTimer: (updates: {
    time_remaining?: number;
    phase?: string;
    current_task_id?: number;
    pomodoros_completed?: number;
  }) => Promise<void>;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  time: 0,
  maxTime: 0,
  isRunning: false,
  phase: "focus",
  currentTaskId: null,
  sessionId: null,
  pomodorosCompleted: 0,
  isLoading: false,

  startTimer: async () => {
    set({ isLoading: true });
    try {
      await apiClient.updateActiveSession({ is_running: true });
      set({ isRunning: true });
      await get().loadActiveSession();
    } catch (error) {
      console.error("Failed to start timer:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  pauseTimer: async () => {
    set({ isLoading: true });
    try {
      // Sync current time with backend before pausing
      const { time } = get();
      await apiClient.updateActiveSession({ 
        is_running: false,
        time_remaining: time 
      });
      set({ isRunning: false });
      await get().loadActiveSession();
    } catch (error) {
      console.error("Failed to pause timer:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  resetTimer: async () => {
    set({ isLoading: true });
    try {
      // Reset to max time
      const { maxTime } = get();
      await apiClient.updateActiveSession({
        is_running: false,
        time_remaining: maxTime,
      });
      set({ isRunning: false, time: maxTime });
      await get().loadActiveSession();
    } catch (error) {
      console.error("Failed to reset timer:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  setTime: (time: number) => set({ time }),
  setMaxTime: (maxTime: number) => set({ maxTime }),

  setSession: async (sessionId: number) => {
    set({ isLoading: true });
    try {
      await apiClient.startActiveSession(sessionId);
      set({ sessionId });
      await get().loadActiveSession();
    } catch (error) {
      console.error("Failed to set session:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadActiveSession: async () => {
    try {
      const activeSession = (await apiClient.getActiveSession()) as {
        time_remaining: number;
        is_running: boolean;
        phase: string;
        current_task_id: number | null;
        session_id: number;
        pomodoros_completed: number;
      };
      set({
        time: activeSession.time_remaining,
        maxTime: activeSession.time_remaining, // Reset maxTime to current session's duration
        isRunning: activeSession.is_running,
        phase: activeSession.phase,
        currentTaskId: activeSession.current_task_id,
        sessionId: activeSession.session_id,
        pomodorosCompleted: activeSession.pomodoros_completed,
      });
    } catch (error) {
      console.error("Failed to load active session:", error);
      // Reset to default state if no active session
      set({
        time: 0,
        maxTime: 0,
        isRunning: false,
        phase: "focus",
        currentTaskId: null,
        sessionId: null,
        pomodorosCompleted: 0,
      });
    }
  },

  updateTimer: async (updates) => {
    set({ isLoading: true });
    try {
      await apiClient.updateActiveSession(updates);
      await get().loadActiveSession();
    } catch (error) {
      console.error("Failed to update timer:", error);
    } finally {
      set({ isLoading: false });
    }
  },
}));
