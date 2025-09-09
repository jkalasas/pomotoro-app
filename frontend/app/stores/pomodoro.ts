import { create } from "zustand";
// NOTE: Timer now runs continuously across phase transitions (focus <-> break).
// handlePhaseCompletion auto-starts the next phase. User initiated actions
// like reset still pause per their semantics. skipRest now fast-forwards to
// the next focus phase and CONTINUES running (was previously pausing).
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
  totalPomodorosCompleted: number; // Track total pomodoros across all sessions for long breaks
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
  settings: {
    focus_duration: number;
    short_break_duration: number;
    long_break_duration: number;
    long_break_per_pomodoros: number;
  };
  startTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resetTimer: () => Promise<void>;
  setTime: (time: number) => void;
  setMaxTime: (maxTime: number) => void;
  updateSettings: (settings: {
    focus_duration: number;
    short_break_duration: number;
    long_break_duration: number;
    long_break_per_pomodoros: number;
  }) => void;
  updateSettingsFromTask: (taskSessionId: number) => Promise<void>;
  syncConfigWithCurrentTask: () => Promise<void>;
  setSession: (sessionId: number) => Promise<void>;
  loadActiveSession: () => Promise<void>;
  handlePhaseCompletion: () => Promise<void>;
  updateTimer: (updates: {
    time_remaining?: number;
    phase?: string;
    current_task_id?: number;
    pomodoros_completed?: number;
    is_running?: boolean;
  }) => Promise<void>;
  setShowRestOverlay: (show: boolean) => void;
  skipRest: () => Promise<void>;
  triggerSessionCompletion: (sessionId: number, sessionName: string, totalTasks: number, completedTasks: number, focusDuration: number) => void;
  setShowFeedbackModal: (show: boolean) => void;
  submitSessionFeedback: (focusLevel: string, reflection?: string) => Promise<void>;
  cleanup: () => void;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  let _bgInterval: NodeJS.Timeout | null = null;
  // Suppress background sync for a brief window after intentional updates to avoid races
  let _suppressSyncUntilMs = 0;
  
  // Set up event listeners for overlay communication
  if (typeof window !== "undefined") {
    listen('skip-rest', () => {
      get().skipRest();
    });

    // Listen for session completion events from task store
    window.addEventListener('session-completion', (event: any) => {
      const { sessionId, sessionName, totalTasks, completedTasks, focusDuration } = event.detail;
      get().triggerSessionCompletion(sessionId, sessionName, totalTasks, completedTasks, focusDuration);
    });

    // Listen for Tauri app close events (when user actually quits via tray)
    if ('__TAURI__' in window) {
      listen('tauri://close-requested', () => {
        const state = get();
        if (state.isRunning) {
          // App is being properly closed - stop timer immediately
          apiClient.updateActiveSession({ 
            time_remaining: state.time,
            is_running: false
          }).catch(() => {
            // Continue even if sync fails
          });
        }
        // Close overlay if open
        if (state.showRestOverlay) {
          useWindowStore.getState().closeOverlayWindow().catch(() => {});
        }
      });
      
      // Also listen for app hide events (when window is hidden but not closed)
      listen('tauri://window-hide', () => {
        const state = get();
        if (state.isRunning) {
          // Window is being hidden - stop timer to prevent background running
          apiClient.updateActiveSession({ 
            time_remaining: state.time,
            is_running: false
          }).then(() => {
            set({ isRunning: false });
          }).catch(() => {
            set({ isRunning: false });
          });
        }
      });
    }

    // Background ticker: keep the timer running even when Pomodoro page
    // unmounts. This decrements the stored time every second when
    // `isRunning` is true, performs a backend sync every 10s and handles
    // completion. It also ensures the rest overlay is created/closed when
    // entering/exiting break phases so the overlay works when other pages
    // are active.
    const startBackgroundTicker = () => {
      if (_bgInterval) {
        clearInterval(_bgInterval);
      }
      
      _bgInterval = setInterval(() => {
        try {
          const state = get();

          if (state.isRunning && state.time > 0) {
            const newTime = state.time - 1;
            set({ time: newTime });

            // Sync with backend every 10 seconds but skip during suppression window
            if (newTime > 0 && newTime % 10 === 0 && newTime > 5 && Date.now() >= _suppressSyncUntilMs) {
              apiClient.updateActiveSession({ time_remaining: newTime }).catch(() => {
                // Backend sync failed - continue with local timer
              });
            }

            // Handle timer completion
            if (newTime === 0) {
              get().handlePhaseCompletion();
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
              // Failed to create overlay window from background ticker
              set({ showRestOverlay: false });
            }
          } else if ((!isBreakPhase || !state.isRunning || state.time <= 0) && state.showRestOverlay) {
            set({ showRestOverlay: false });
            try {
              useWindowStore.getState().closeOverlayWindow();
            } catch (error) {
              // Failed to close overlay window from background ticker
            }
          }
        } catch (err) {
          // Error in pomodoro background ticker
        }
      }, 1000);
    };

    // Start the ticker
    startBackgroundTicker();

    // Cleanup on page unload - CRITICAL: stop the timer
    const handleBeforeUnload = () => {
      // Stop the timer when app is closing
      const state = get();
      if (state.isRunning) {
        // Immediately sync current state to backend and stop timer
        apiClient.updateActiveSession({ 
          time_remaining: state.time,
          is_running: false  // Stop the timer when app closes
        }).catch(() => {
          // Even if sync fails, we want to stop the local timer
        });
      }
      
      if (_bgInterval) {
        clearInterval(_bgInterval);
        _bgInterval = null;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Listen for Tauri window hide events (since close is prevented)
    if (typeof window !== "undefined" && '__TAURI__' in window) {
      // For Tauri apps, we need special handling since close is prevented
      let hideTimer: NodeJS.Timeout | null = null;
      
      const handleVisibilityChangeForTauri = () => {
        if (document.hidden) {
          // App is becoming hidden - start timer to detect if it's a real app hide vs tab switch
          hideTimer = setTimeout(() => {
            const state = get();
            if (document.hidden && state.isRunning) {
              // App has been hidden for 500ms and timer is running - stop it
              apiClient.updateActiveSession({ 
                time_remaining: state.time,
                is_running: false
              }).then(() => {
                set({ isRunning: false });
              }).catch(() => {
                set({ isRunning: false });
              });
              
              // Also close any overlay windows
              if (state.showRestOverlay) {
                useWindowStore.getState().closeOverlayWindow().catch(() => {});
                set({ showRestOverlay: false });
              }
            }
          }, 500);
        } else {
          // App is becoming visible - cancel hide timer and reload state
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
          get().loadActiveSession();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChangeForTauri);
    } else {
      // For non-Tauri apps, use normal visibility handling
      const handleVisibilityChange = () => {
        if (document.hidden) {
          // App is becoming hidden - sync current state
          const state = get();
          if (state.isRunning) {
            apiClient.updateActiveSession({ 
              time_remaining: state.time,
              is_running: state.isRunning
            }).catch(() => {
              // Sync failed but continue
            });
          }
        } else {
          // App is becoming visible - reload state from backend
          get().loadActiveSession();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  return {
  time: 25 * 60, // Initialize with default 25 minutes
  maxTime: 25 * 60, // Initialize with default 25 minutes
  isRunning: false,
  phase: "focus",
  currentTaskId: null,
  sessionId: null,
  pomodorosCompleted: 0,
  totalPomodorosCompleted: typeof window !== "undefined" 
    ? parseInt(localStorage.getItem('totalPomodorosCompleted') || '0', 10) 
    : 0,
  isLoading: false,
  showRestOverlay: false,
  showFeedbackModal: false,
  pendingSessionCompletion: null,
  settings: {
    focus_duration: 25,
    short_break_duration: 5,
    long_break_duration: 15,
    long_break_per_pomodoros: 4,
  },

  startTimer: async () => {
    set({ isLoading: true });
    try {
      // Initialize timer if not set
      const { time, maxTime, settings, sessionId } = get();
      if (time === 0 && maxTime === 0) {
        const focusDuration = settings.focus_duration * 60; // Convert to seconds
        set({ time: focusDuration, maxTime: focusDuration });
      }
      
      // Update backend first
      await apiClient.updateActiveSession({ is_running: true });
      
      // Then update local state
      set({ isRunning: true });
      
      // Log analytics event
      if (sessionId) {
        useAnalyticsStore.getState().logTimerStart(sessionId, get().phase);
      }
    } catch (error) {
      // Failed to start timer
    } finally {
      set({ isLoading: false });
    }
  },

  pauseTimer: async () => {
    set({ isLoading: true });
    try {
      const { time, sessionId } = get();
      
      // Update backend first with current time and paused state
      await apiClient.updateActiveSession({ 
        is_running: false,
        time_remaining: time
      });
      
      // Then update local state
      set({ isRunning: false });
      
      // Log analytics event
      if (sessionId) {
        useAnalyticsStore.getState().logTimerPause(sessionId, get().phase);
      }
    } catch (error) {
      // Failed to pause timer
    } finally {
      set({ isLoading: false });
    }
  },

  resetTimer: async () => {
    set({ isLoading: true });
    try {
      // Get current settings
      const { settings, sessionId, phase, time } = get();
      const resetTime = settings.focus_duration * 60; // Convert to seconds
      
      // Update backend first
      await apiClient.updateActiveSession({
        is_running: false,
        time_remaining: resetTime,
        phase: "focus"
      });
      
      // Then update local state
      set({ 
        isRunning: false, 
        time: resetTime,
        maxTime: resetTime,
        phase: "focus"
      });
      
      // Log analytics event
      if (sessionId) {
        useAnalyticsStore.getState().logTimerReset(sessionId, phase, time);
      }
    } catch (error) {
      // Failed to reset timer
    } finally {
      set({ isLoading: false });
    }
  },

  setTime: (time: number) => set({ time }),
  setMaxTime: (maxTime: number) => set({ maxTime }),

  updateSettings: (newSettings: {
    focus_duration: number;
    short_break_duration: number;
    long_break_duration: number;
    long_break_per_pomodoros: number;
  }) => {
    const oldSettings = get().settings;
    set({ settings: newSettings });
    
    // Log settings changes
    Object.keys(newSettings).forEach(key => {
      if (oldSettings[key as keyof typeof oldSettings] !== newSettings[key as keyof typeof newSettings]) {
        useAnalyticsStore.getState().logSettingsChange(
          key,
          oldSettings[key as keyof typeof oldSettings],
          newSettings[key as keyof typeof newSettings]
        );
      }
    });
    
    // Only update timer with new focus duration if currently in focus phase AND timer is not running
    // This prevents resetting the timer during task transitions when the timer is actively running
    const { phase, isRunning } = get();
    if (phase === "focus" && !isRunning) {
      const newTime = newSettings.focus_duration * 60;
      set({ time: newTime, maxTime: newTime });
    }
  },

  updateSettingsFromTask: async (taskSessionId: number) => {
    try {
      const session = await apiClient.getSession(taskSessionId) as {
        focus_duration: number;
        short_break_duration: number;
        long_break_duration: number;
        long_break_per_pomodoros: number;
      };
      
      const newSettings = {
        focus_duration: session.focus_duration,
        short_break_duration: session.short_break_duration,
        long_break_duration: session.long_break_duration,
        long_break_per_pomodoros: session.long_break_per_pomodoros,
      };
      
      get().updateSettings(newSettings);
    } catch (error) {
      // Failed to update settings from task session
    }
  },

  syncConfigWithCurrentTask: async () => {
    try {
      const { useSchedulerStore } = await import('./scheduler');
      const schedulerState = useSchedulerStore.getState();
      const currentTask = schedulerState.getCurrentTask();
      
      if (currentTask) {
        const prev = get();

        // Remember previous focus max to evaluate reset conditions
        const prevFocusSeconds = prev.settings.focus_duration * 60;
        const prevRemaining = prev.time;
        const wasRunning = prev.isRunning;
        const prevPhase = prev.phase;

        // Update settings from the current task's session (adopt latest task config)
        await get().updateSettingsFromTask(currentTask.session_id);

        const after = get();
        const newFocusSeconds = after.settings.focus_duration * 60;

        if (prevPhase === "focus") {
          // Reset if remaining equals previous session max or exceeds new session max
          const mustReset = prevRemaining === prevFocusSeconds || prevRemaining > newFocusSeconds;
          const newRemaining = mustReset ? newFocusSeconds : Math.min(prevRemaining, newFocusSeconds);

          // Immediately reflect new config locally for snappy UI
          set({ maxTime: newFocusSeconds, time: newRemaining, currentTaskId: currentTask.id });

          await get().updateTimer({
            current_task_id: currentTask.id,
            phase: mustReset ? 'focus' : undefined,
            time_remaining: newRemaining,
            is_running: wasRunning,
          });
        } else {
          // During breaks, keep timer running state and just switch the task for UI/association
          set({ currentTaskId: currentTask.id });
          await get().updateTimer({
            current_task_id: currentTask.id,
            is_running: wasRunning,
          });
        }
      }
    } catch (error) {
      // Failed to sync config with current task
    }
  },

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
      
      // Update settings from the session configuration
      await get().updateSettingsFromTask(sessionId);
      
      await get().loadActiveSession();
      
      // Log analytics event
      if (previousSessionId && previousSessionId !== sessionId) {
        useAnalyticsStore.getState().logSessionSwitch(previousSessionId, sessionId);
      } else {
        // Get session name for logging (you might need to pass this as parameter)
        useAnalyticsStore.getState().logSessionStart(sessionId, `Session ${sessionId}`);
      }
    } catch (error) {
      // Failed to set session
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
      
      // If the timer was running when we last closed but backend says it's not running,
      // and significant time has passed, we should respect the backend state
      // This prevents the timer from continuing to run after app closure
      const wasRunningLocally = currentState.isRunning;
      const isRunningOnBackend = activeSession.is_running;
      
      // Always respect backend state for is_running to prevent phantom timers
      if (wasRunningLocally && !isRunningOnBackend) {
        // Backend says timer stopped - respect that
        set({ isRunning: false });
      }
      
      // Determine which session's config to use based on current task
      let configSessionId = activeSession.session_id;
      let useCurrentTaskSession = false;
      
      // If there's a current task, check if it belongs to a different session
      if (activeSession.current_task_id) {
        try {
          const { useSchedulerStore } = await import('./scheduler');
          const schedulerState = useSchedulerStore.getState();
          const currentSchedule = schedulerState.currentSchedule;
          
          if (currentSchedule) {
            const currentTask = currentSchedule.find(task => task.id === activeSession.current_task_id);
            if (currentTask) {
              // Always use the current task's session for configuration
              configSessionId = currentTask.session_id;
              useCurrentTaskSession = currentTask.session_id !== activeSession.session_id;
            }
          }
        } catch (error) {
          // Failed to check scheduler, use default session
        }
      }
      
      // Update settings - always use the current task's session config if available
      const sessionChanged = currentState.sessionId !== activeSession.session_id;
      const configChanged = useCurrentTaskSession || sessionChanged || currentState.sessionId === null;
      
      if (configChanged) {
        try {
          await get().updateSettingsFromTask(configSessionId);
        } catch (error) {
          // Failed to update settings from session
        }
      }
      
      // Calculate the correct maxTime based on the session configuration and phase
      // We need to get the session details to know the proper timing for each phase
      let newMaxTime = activeSession.time_remaining;
      
      // If the phase hasn't changed and we already have a maxTime, and the timer isn't
      // at the beginning (time_remaining equals maxTime), keep the existing maxTime
      // to preserve the progress visualization. However, if the session ID changed
      // or if we're at the beginning of a timer period, update maxTime.
      const phaseChanged = currentState.phase !== activeSession.phase;
      const isAtBeginning = !currentState.maxTime || currentState.time === currentState.maxTime || currentState.maxTime === 0;
      
      if (phaseChanged || sessionChanged || configChanged || isAtBeginning) {
        // Get session details to determine correct maxTime for the current phase
        // Use the config session ID to ensure we get the right timing values
        try {
          const session = await apiClient.getSession(configSessionId) as {
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
          // Failed to get session details for maxTime calculation
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
      // Failed to load active session - reset to default state
      // Initialize with default focus duration instead of 0
      const { settings } = get();
      const defaultFocusTime = settings.focus_duration * 60;
      set({
        time: defaultFocusTime,
        maxTime: defaultFocusTime,
        isRunning: false,
        phase: "focus",
        currentTaskId: null,
        sessionId: null,
        pomodorosCompleted: 0,
      });
    }
  },

  handlePhaseCompletion: async () => {
    const { phase, pomodorosCompleted, sessionId, totalPomodorosCompleted, settings } = get();
    
    if (!sessionId) {
      console.error('No active session found for phase completion');
      return;
    }

    try {
      // Use current settings already synced with the current task's session
      const session = {
        focus_duration: settings.focus_duration,
        short_break_duration: settings.short_break_duration,
        long_break_duration: settings.long_break_duration,
        long_break_per_pomodoros: settings.long_break_per_pomodoros,
      } as const;

      let nextPhase: string;
      let nextDuration: number;
      let newPomodorosCompleted = pomodorosCompleted;
      let newTotalPomodorosCompleted = totalPomodorosCompleted;

  if (phase === "focus") {
        // Focus phase completed - increment pomodoro count and move to break
        newPomodorosCompleted = pomodorosCompleted + 1;
        newTotalPomodorosCompleted = totalPomodorosCompleted + 1;
        
        // Use total pomodoros for long break calculation (always track globally)
        if (newTotalPomodorosCompleted % session.long_break_per_pomodoros === 0) {
          nextPhase = "long_break";
          nextDuration = session.long_break_duration * 60;
        } else {
          nextPhase = "short_break";
          nextDuration = session.short_break_duration * 60;
        }
        
        // Log pomodoro completion
        try {
          useAnalyticsStore.getState().logPomodoroComplete(sessionId, newPomodorosCompleted);
        } catch (analyticsError) {
          // Analytics error - continue with timer operation
        }
      } else {
        // Break phase completed - move back to focus
        nextPhase = "focus";
        nextDuration = session.focus_duration * 60;
        // Play focus resume sound
        try {
          const { useAppSettings } = await import('./settings');
          const { focusResumeSound } = useAppSettings.getState();
          const src = focusResumeSound.startsWith('/') ? focusResumeSound : `/audio/${focusResumeSound}`;
          const audio = new Audio(src);
          audio.volume = 0.8;
          audio.play().catch(() => {});
        } catch { /* ignore sound errors */ }
      }

  // Update the backend with new phase and KEEP the timer running; suppress ticker sync briefly
  const suppressMs = 1500;
  _suppressSyncUntilMs = Date.now() + suppressMs;
  await apiClient.updateActiveSession({
        phase: nextPhase,
        time_remaining: nextDuration,
        is_running: true, // Auto-continue into next phase
        pomodoros_completed: newPomodorosCompleted
      });
      
      // Update local state (including total pomodoros) and keep running
      set({
        phase: nextPhase,
        time: nextDuration,
        maxTime: nextDuration,
        isRunning: true, // Continuous timer across phases
        pomodorosCompleted: newPomodorosCompleted,
        totalPomodorosCompleted: newTotalPomodorosCompleted
      });
      
      // Store total pomodoros in localStorage for persistence
      if (typeof window !== "undefined") {
        localStorage.setItem('totalPomodorosCompleted', newTotalPomodorosCompleted.toString());
      }
      
      // Log phase change analytics
      try {
        useAnalyticsStore.getState().logEvent('phase_change', {
          session_id: sessionId,
          from_phase: phase,
          to_phase: nextPhase,
          change_time: new Date().toISOString()
        });
        
        if (nextPhase.includes('break')) {
          useAnalyticsStore.getState().logBreakStart(sessionId, nextPhase);
        }
      } catch (analyticsError) {
        // Analytics error - continue with timer operation
      }
      
    } catch (error) {
      // Failed to handle phase completion - fallback: just stop the timer
      set({ isRunning: false });
      await apiClient.updateActiveSession({ is_running: false });
    }
  },

  updateTimer: async (updates) => {
    set({ isLoading: true });
    try {
      const prevState = get();
  // Avoid background ticker overwriting this direct update for a brief moment
  _suppressSyncUntilMs = Date.now() + 1500;
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
      // Failed to update timer - keep UI in sync
    } finally {
      set({ isLoading: false });
    }
  },

  setShowRestOverlay: (show: boolean) => {
    const currentState = get();
    
    if (show && !currentState.showRestOverlay) {
      // Create overlay window when showing (only if not already showing)
      const { time } = get();
      set({ showRestOverlay: true });
      
      try {
        useWindowStore.getState().createOverlayWindow(time);
      } catch (error) {
        // Failed to create overlay window - reset state
        set({ showRestOverlay: false });
      }
    } else if (!show && currentState.showRestOverlay) {
      // Close overlay window when hiding (only if currently showing)
      set({ showRestOverlay: false });
      
      try {
        useWindowStore.getState().closeOverlayWindow();
      } catch (error) {
        // Failed to close overlay window
      }
    }
  },

  skipRest: async () => {
    const { sessionId, phase, isRunning, settings } = get();
    
    if (!sessionId) {
      console.error('No active session found for skip rest');
      return;
    }
    // Only meaningful during a break; ignore if already in focus
    if (!phase.includes('break')) {
      return;
    }
    
    set({ isLoading: true });
    try {
      // Hide overlay if visible
      if (get().showRestOverlay) {
        set({ showRestOverlay: false });
        try { await useWindowStore.getState().closeOverlayWindow(); } catch { /* ignore */ }
      }
      
  // Use current settings for focus duration
  const focusDuration = settings.focus_duration * 60; // seconds
      
  // Fast-forward to focus phase AND keep timer running (continuous flow). Suppress ticker briefly
  _suppressSyncUntilMs = Date.now() + 1500;
  await apiClient.updateActiveSession({
        phase: 'focus',
        is_running: true, // continue running instead of pausing
        time_remaining: focusDuration,
      });
      
      // Local state update
      set({
        phase: 'focus',
        time: focusDuration,
        maxTime: focusDuration,
        isRunning: true,
      });
      
      // Analytics
      try {
        useAnalyticsStore.getState().logBreakSkip(sessionId, phase);
        useAnalyticsStore.getState().logEvent('phase_change', {
          session_id: sessionId,
          from_phase: phase,
          to_phase: 'focus',
          change_time: new Date().toISOString(),
          skipped: true,
          was_running: isRunning
        });
      } catch { /* ignore analytics errors */ }
    } catch (error) {
      // On failure, ensure timer doesn't get stuck; leave existing state
    } finally {
      set({ isLoading: false });
    }
  },

  triggerSessionCompletion: (sessionId, sessionName, totalTasks, completedTasks, focusDuration) => {
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

  cleanup: () => {
    if (_bgInterval) {
      clearInterval(_bgInterval);
      _bgInterval = null;
    }
  },
  };
});
