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
  showFeedbackModal: boolean;
  pendingSessionCompletion: {
    sessionId: number;
    sessionName: string;
    totalTasks: number;
    completedTasks: number;
    focusDuration: number;
  } | null;
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
  triggerSessionCompletion: (sessionId: number, sessionName: string, totalTasks: number, completedTasks: number, focusDuration: number) => void;
  setShowFeedbackModal: (show: boolean) => void;
  submitSessionFeedback: (focusLevel: string, reflection?: string) => Promise<void>;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  // Set up event listeners for overlay communication
  if (typeof window !== "undefined") {
    listen('skip-rest', () => {
      console.log('Received skip-rest event from overlay');
      get().skipRest();
    });

    // Listen for session completion events from task store
    window.addEventListener('session-completion', (event: any) => {
      console.log('Session completion event received:', event.detail);
      const { sessionId, sessionName, totalTasks, completedTasks, focusDuration } = event.detail;
      get().triggerSessionCompletion(sessionId, sessionName, totalTasks, completedTasks, focusDuration);
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
  showFeedbackModal: false,
  pendingSessionCompletion: null,

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
      // First check if the session is completed
      const session = await apiClient.getSession(sessionId) as { completed: boolean };
      if (session.completed) {
        throw new Error("Cannot start a completed session");
      }
      
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
      throw error; // Re-throw to allow UI to handle the error
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
      
      const currentState = get();
      
      // Calculate the correct maxTime based on the session configuration and phase
      // We need to get the session details to know the proper timing for each phase
      let newMaxTime = activeSession.time_remaining;
      
      // If the phase hasn't changed and we already have a maxTime, and the timer isn't
      // at the beginning (time_remaining equals maxTime), keep the existing maxTime
      // to preserve the progress visualization. However, if the session ID changed
      // or if we're at the beginning of a timer period, update maxTime.
      const phaseChanged = currentState.phase !== activeSession.phase;
      const sessionChanged = currentState.sessionId !== activeSession.session_id;
      const isAtBeginning = !currentState.maxTime || currentState.time === currentState.maxTime || currentState.maxTime === 0;
      
      if (phaseChanged || sessionChanged || isAtBeginning) {
        // Get session details to determine correct maxTime for the current phase
        try {
          const session = await apiClient.getSession(activeSession.session_id) as {
            focus_duration: number;
            short_break_duration: number;
            long_break_duration: number;
          };
          
          if (activeSession.phase === "focus") {
            newMaxTime = session.focus_duration * 60;
          } else if (activeSession.phase === "short_break") {
            newMaxTime = session.short_break_duration * 60;
          } else if (activeSession.phase === "long_break") {
            newMaxTime = session.long_break_duration * 60;
          }
        } catch (error) {
          console.error("Failed to get session details for maxTime calculation:", error);
          // Fall back to using time_remaining as maxTime
          newMaxTime = activeSession.time_remaining;
        }
      } else {
        // Keep existing maxTime to preserve progress visualization
        newMaxTime = currentState.maxTime;
      }
      
      set({
        time: activeSession.time_remaining,
        maxTime: newMaxTime,
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

  triggerSessionCompletion: (sessionId, sessionName, totalTasks, completedTasks, focusDuration) => {
    console.log('triggerSessionCompletion called with:', { sessionId, sessionName, totalTasks, completedTasks, focusDuration });
    set({
      showFeedbackModal: true,
      pendingSessionCompletion: {
        sessionId,
        sessionName,
        totalTasks,
        completedTasks,
        focusDuration,
      },
    });
    console.log('Modal state updated - showFeedbackModal:', true);
  },

  setShowFeedbackModal: (show) => {
    set({ showFeedbackModal: show });
    if (!show) {
      set({ pendingSessionCompletion: null });
    }
  },

  submitSessionFeedback: async (focusLevel, reflection) => {
    const { pendingSessionCompletion } = get();
    if (!pendingSessionCompletion) {
      throw new Error("No pending session completion");
    }

    set({ isLoading: true });
    try {
      // Log feedback submission analytics
      useAnalyticsStore.getState().logFeedbackSubmitted(
        pendingSessionCompletion.sessionId,
        focusLevel,
        reflection
      );
      
      // Use API client directly since we're mixing stores
      await apiClient.completeSession(
        pendingSessionCompletion.sessionId,
        focusLevel,
        reflection
      );
      
      // Log session completion analytics
      useAnalyticsStore.getState().logSessionComplete(
        pendingSessionCompletion.sessionId,
        focusLevel,
        pendingSessionCompletion.completedTasks,
        pendingSessionCompletion.totalTasks
      );
      
      // Refresh data in all relevant stores
      const { useTaskStore } = await import('./tasks');
      
      // Use the centralized refresh function
      await useTaskStore.getState().refreshAllData();
      
      set({
        showFeedbackModal: false,
        pendingSessionCompletion: null,
      });
      
      // Trigger global refresh event
      if (typeof window !== 'undefined') {
        console.log('Triggering session-completed event for refresh');
        window.dispatchEvent(new CustomEvent('session-completed', {
          detail: { sessionId: pendingSessionCompletion.sessionId }
        }));
      }
    } catch (error) {
      console.error("Failed to submit session feedback:", error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
  };
});
