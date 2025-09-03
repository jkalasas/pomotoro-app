import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { apiClient } from "~/lib/api";
import { useWindowStore } from "./window";
import { useAnalyticsStore } from "./analytics";

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

    // Background ticker: keep the timer running even when Pomodoro page
    // unmounts. This decrements the stored time every second when
    // `isRunning` is true, performs a backend sync every 10s and handles
    // completion. It also ensures the rest overlay is created/closed when
    // entering/exiting break phases so the overlay works when other pages
    // are active.
    try {
      let _bgInterval = window.setInterval(() => {
        try {
          const state = get();

          if (state.isRunning && state.time > 0) {
            const newTime = state.time - 1;
            set({ time: newTime });

            // Sync with backend every 10 seconds (same heuristic as UI)
            if (newTime > 0 && newTime % 10 === 0) {
              apiClient.updateActiveSession({ time_remaining: newTime }).catch(console.error);
            }

            // Handle timer completion
            if (newTime === 0) {
              set({ isRunning: false });
              apiClient.updateActiveSession({ is_running: false }).catch(console.error);
            }
          }

          // Ensure rest overlay is shown even when the Pomodoro page is not
          // mounted: create overlay on break phases, close otherwise.
          const isBreakPhase = state.phase === "short_break" || state.phase === "long_break";
          if (isBreakPhase && state.isRunning && state.time > 0 && !state.showRestOverlay) {
            set({ showRestOverlay: true });
            try {
              useWindowStore.getState().createOverlayWindow(state.time);
            } catch (error) {
              console.error('Failed to create overlay window from background ticker', error);
              set({ showRestOverlay: false });
            }
          } else if ((!isBreakPhase || !state.isRunning || state.time <= 0) && state.showRestOverlay) {
            set({ showRestOverlay: false });
            try {
              useWindowStore.getState().closeOverlayWindow();
            } catch (error) {
              console.error('Failed to close overlay window from background ticker', error);
            }
          }
        } catch (err) {
          console.error('Error in pomodoro background ticker', err);
        }
      }, 1000);

      // Cleanup on page unload
      window.addEventListener('beforeunload', () => {
        if (_bgInterval) {
          clearInterval(_bgInterval as unknown as number);
        }
      });
    } catch (err) {
      console.error('Failed to start pomodoro background ticker', err);
    }
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
      const { sessionId, phase } = get();
      await apiClient.updateActiveSession({ is_running: true });
      set({ isRunning: true });
      await get().loadActiveSession();
      
      // Log analytics event
      if (sessionId) {
        useAnalyticsStore.getState().logTimerStart(sessionId, phase);
      }
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
      const { time, sessionId, phase } = get();
      await apiClient.updateActiveSession({ 
        is_running: false,
        time_remaining: time 
      });
      set({ isRunning: false });
      await get().loadActiveSession();
      
      // Log analytics event
      if (sessionId) {
        useAnalyticsStore.getState().logTimerPause(sessionId, phase);
      }
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
      const previousSessionId = get().sessionId;
      await apiClient.startActiveSession(sessionId);
      set({ sessionId });
      await get().loadActiveSession();
      
      // Log analytics event
      if (previousSessionId && previousSessionId !== sessionId) {
        useAnalyticsStore.getState().logSessionSwitch(previousSessionId, sessionId);
      } else {
        // Get session name for logging (you might need to pass this as parameter)
        useAnalyticsStore.getState().logSessionStart(sessionId, `Session ${sessionId}`);
      }
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
      // Only set maxTime if it's not already set. The backend reports the
      // remaining time, but we must not overwrite the original session
      // duration (maxTime) on every sync; otherwise pausing (which causes a
      // backend update with the current remaining time) will make the chart
      // appear full again because maxTime would equal time.
      const currentMax = get().maxTime;
      set({
        time: activeSession.time_remaining,
        maxTime: currentMax && currentMax > 0 ? currentMax : activeSession.time_remaining,
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
      const prevState = get();
      await apiClient.updateActiveSession(updates);
      await get().loadActiveSession();
      
      // Log analytics events for state changes
      const newState = get();
      const { sessionId } = newState;
      
      if (sessionId) {
        // Log phase changes
        if (updates.phase && updates.phase !== prevState.phase) {
          if (updates.phase.includes('break')) {
            useAnalyticsStore.getState().logBreakStart(sessionId, updates.phase);
          }
        }
        
        // Log pomodoro completion
        if (updates.pomodoros_completed && updates.pomodoros_completed > prevState.pomodorosCompleted) {
          useAnalyticsStore.getState().logPomodoroComplete(sessionId, updates.pomodoros_completed);
        }
      }
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
