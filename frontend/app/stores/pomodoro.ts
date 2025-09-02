import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { apiClient } from "~/lib/api";
import { useWindowStore } from "./window";

export interface PomodoroState {
  time: number;
  maxTime: number;
  isRunning: boolean;
  phase: string;
  currentTaskId: number | null;
  sessionId: number | null;
  pomodorosCompleted: number;
  isLoading: boolean;
  showRestOverlay: boolean;
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
  setShowRestOverlay: (show: boolean) => void;
  skipRest: () => Promise<void>;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  // Set up event listeners for overlay communication
  if (typeof window !== "undefined") {
    listen('skip-rest', () => {
      console.log('Received skip-rest event from overlay');
      get().skipRest();
    });
  }

  return {
  time: 0,
  maxTime: 0,
  isRunning: false,
  phase: "focus",
  currentTaskId: null,
  sessionId: null,
  pomodorosCompleted: 0,
  isLoading: false,
  showRestOverlay: false,

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

  setShowRestOverlay: (show: boolean) => {
    const currentState = get();
    console.log('setShowRestOverlay called:', { 
      show, 
      currentState: currentState.showRestOverlay,
      currentTime: currentState.time 
    });
    
    if (show && !currentState.showRestOverlay) {
      // Create overlay window when showing (only if not already showing)
      const { time } = get();
      console.log('Creating overlay window with time:', time);
      set({ showRestOverlay: true });
      
      try {
        useWindowStore.getState().createOverlayWindow(time);
      } catch (error) {
        console.error('Failed to create overlay window:', error);
        // Reset state if creation fails
        set({ showRestOverlay: false });
      }
    } else if (!show && currentState.showRestOverlay) {
      // Close overlay window when hiding (only if currently showing)
      console.log('Closing overlay window');
      set({ showRestOverlay: false });
      
      try {
        useWindowStore.getState().closeOverlayWindow();
      } catch (error) {
        console.error('Failed to close overlay window:', error);
      }
    } else {
      console.log('No action needed - state already matches:', { show, current: currentState.showRestOverlay });
    }
  },

  skipRest: async () => {
    console.log('skipRest called');
    set({ isLoading: true });
    try {
      // First, update the overlay state
      set({ showRestOverlay: false });
      
      // Close the overlay window
      console.log('Closing overlay window from skipRest');
      await useWindowStore.getState().closeOverlayWindow();
      
      // Skip to next phase (usually back to focus)
      console.log('Updating session to skip rest');
      await apiClient.updateActiveSession({
        phase: "focus",
        is_running: false,
        time_remaining: 25 * 60, // Default 25 minute focus session
      });
      
      console.log('Loading active session after skip');
      await get().loadActiveSession();
      console.log('skipRest completed successfully');
    } catch (error) {
      console.error("Failed to skip rest:", error);
    } finally {
      set({ isLoading: false });
    }
  },
  };
});
