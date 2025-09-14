import { create } from "zustand";
// NOTE: Timer now runs continuously across phase transitions (focus <-> break).
// handlePhaseCompletion auto-starts the next phase. User initiated actions
// like reset still pause per their semantics. skipRest now fast-forwards to
// the next focus phase and CONTINUES running (was previously pausing).
import { listen } from "@tauri-apps/api/event";
import { apiClient } from "~/lib/api";
import { isTauri } from "~/lib/utils";
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
  // Time tracking for completion analytics
  totalFocusTime: number; // Total focus time in seconds across all tasks
  currentTaskTime: number; // Time spent on current task in seconds
  taskStartTime: number | null; // Timestamp when current task started
  settings: {
    focus_duration: number;
    short_break_duration: number;
    long_break_duration: number;
    long_break_per_pomodoros: number;
  };
  // Track which session last set the settings and when, to avoid duplicate fetches
  lastSettingsFromSessionId: number | null;
  lastSettingsFetchedAt: number | null;
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
  setShowRestOverlay: (show: boolean) => Promise<void>;
  skipRest: () => Promise<void>;
  extendRest: () => Promise<void>;
  triggerSessionCompletion: (sessionId: number, sessionName: string, totalTasks: number, completedTasks: number, focusDuration: number) => void;
  setShowFeedbackModal: (show: boolean) => void;
  submitSessionFeedback: (focusLevel: string, reflection?: string) => Promise<void>;
  cleanup: () => void;
  // Time tracking methods
  resetTimeTracking: () => void;
  startTaskTimer: (taskId?: number) => void;
  pauseTaskTimer: () => void;
  getTaskCompletionTime: () => number;
  resetTaskTimer: () => void;
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

    // Allow extending current break by a given number of seconds
    listen('extend-rest', () => {
      get().extendRest();
    });

    // Listen for session completion events from task store
    window.addEventListener('session-completion', (event: any) => {
      const { sessionId, sessionName, totalTasks, completedTasks, focusDuration } = event.detail;
      get().triggerSessionCompletion(sessionId, sessionName, totalTasks, completedTasks, focusDuration);
    });

    // Listen for Tauri app close events (when user actually quits via tray)
    if (isTauri()) {
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
      
      // Intentionally do not pause on window hide; keep timer running in background.
      // Previously we paused here, which caused unwanted interruptions.
      listen('tauri://window-hide', () => {
        // No-op: allow background ticker to continue running.
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
      
      _bgInterval = setInterval(async () => {
        try {
          const state = get();

          // Auto-pause only when there are no active tasks in the schedule
          if (state.isRunning) {
            try {
              const { useSchedulerStore } = await import('./scheduler');
              const hasTasks = useSchedulerStore.getState().hasActiveTasks();
              if (!hasTasks) {
                await apiClient.updateActiveSession({ is_running: false, time_remaining: state.time });
                set({ isRunning: false });
                if (state.showRestOverlay) {
                  set({ showRestOverlay: false });
                  try { await useWindowStore.getState().closeOverlayWindow(); } catch {}
                }
                return; // Skip further ticking when no tasks
              }
            } catch { /* ignore scheduler lookup errors */ }
          }

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
              const overlayWindow = await useWindowStore.getState().createOverlayWindow(state.time);
              if (!overlayWindow) {
                // Overlay disabled via environment variable
                set({ showRestOverlay: false });
              }
            } catch (error) {
              // Failed to create overlay window from background ticker
              set({ showRestOverlay: false });
            }
          } else if ((!isBreakPhase || !state.isRunning || state.time <= 0) && state.showRestOverlay) {
            set({ showRestOverlay: false });
            try {
              await useWindowStore.getState().closeOverlayWindow();
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

    // Cleanup on page unload - do not force-pause; just clear local interval
    const handleBeforeUnload = () => {
      // Best-effort: clear ticker to avoid leaks; backend state remains
      if (_bgInterval) {
        clearInterval(_bgInterval);
        _bgInterval = null;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Listen for Tauri window hide events (since close is prevented)
    // Do not pause on visibility change (Tauri or web). We skip visibility listeners
    // to allow uninterrupted background operation.
  }

  // Notification helper function
  const sendFocusNotification = async () => {
    if (!isTauri()) {
      return; // Not in Tauri environment
    }

    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
      
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
      
      if (permissionGranted) {
        sendNotification({
          title: 'Focus Time Started',
          body: 'Your break is over. Time to get back to work!',
        });
      }
    } catch (error) {
      console.warn("Failed to send focus notification:", error);
    }
  };

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
  // Initialize time tracking
  totalFocusTime: typeof window !== "undefined" 
    ? parseInt(localStorage.getItem('totalFocusTime') || '0', 10) 
    : 0,
  currentTaskTime: 0,
  taskStartTime: null,
  showRestOverlay: false,
  showFeedbackModal: false,
  pendingSessionCompletion: null,
  settings: {
    focus_duration: 25,
    short_break_duration: 5,
    long_break_duration: 15,
    long_break_per_pomodoros: 4,
  },
  lastSettingsFromSessionId: null,
  lastSettingsFetchedAt: null,

  startTimer: async () => {
    set({ isLoading: true });
    try {
      // Initialize timer if not set
      const { time, maxTime, settings, sessionId } = get();
      if (time === 0 && maxTime === 0) {
        const focusDuration = settings.focus_duration * 60; // Convert to seconds
        set({ time: focusDuration, maxTime: focusDuration });
      }
      
      // Check if we have an active session, if not try to set one from current task
      if (!sessionId) {
        try {
          // Try to get current task from scheduler
          const { useSchedulerStore } = await import('./scheduler');
          const schedulerState = useSchedulerStore.getState();
          const currentTask = schedulerState.getCurrentTask();
          
          if (currentTask) {
            // Start active session for this task's session
            await get().setSession(currentTask.session_id);
          } else {
            // No current task available, cannot start timer
            throw new Error("No active task available. Please generate a schedule first.");
          }
        } catch (error) {
          throw error;
        }
      }
      
      // Update backend first
      await apiClient.updateActiveSession({ is_running: true });
      
      // Then update local state
      set({ isRunning: true });
      
      // Start task timer tracking for focus phases
      const { phase, currentTaskId } = get();
      if (phase === "focus") {
        get().startTaskTimer(currentTaskId || undefined);
      }
      
      // Analytics for timer start handled by backend via updateActiveSession
    } catch (error) {
      // Failed to start timer
      console.error("Failed to start timer:", error);
      throw error; // Re-throw to let UI handle the error
    } finally {
      set({ isLoading: false });
    }
  },

  pauseTimer: async () => {
    set({ isLoading: true });
    try {
      const { time, sessionId, phase } = get();
      
      // Check if we have an active session
      if (!sessionId) {
        throw new Error("No active session found");
      }
      
      // Pause task timer tracking for focus phases
      if (phase === "focus") {
        get().pauseTaskTimer();
      }
      
      // Update backend first with current time and paused state
      await apiClient.updateActiveSession({ 
        is_running: false,
        time_remaining: time
      });
      
      // Then update local state
      set({ isRunning: false });
      
      // Analytics for timer pause handled by backend
    } catch (error) {
      // Failed to pause timer
      console.error("Failed to pause timer:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  resetTimer: async () => {
    set({ isLoading: true });
    try {
      // Get current settings
      const { settings, sessionId, phase, time } = get();
      
      // Check if we have an active session
      if (!sessionId) {
        throw new Error("No active session found");
      }
      
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
      
      // Reset time tracking
      get().resetTimeTracking();
      
      // Optional: keep timer_reset as frontend-only if desired
    } catch (error) {
      // Failed to reset timer
      console.error("Failed to reset timer:", error);
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
      if (!taskSessionId || !Number.isInteger(taskSessionId) || taskSessionId <= 0) {
        return;
      }
      const { lastSettingsFromSessionId, lastSettingsFetchedAt } = get();
      // Skip duplicate fetches for the same session within a short window
      if (
        lastSettingsFromSessionId === taskSessionId &&
        lastSettingsFetchedAt !== null &&
        Date.now() - lastSettingsFetchedAt < 1000
      ) {
        return;
      }

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
      set({ lastSettingsFromSessionId: taskSessionId, lastSettingsFetchedAt: Date.now() });
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
      // First check if the session is completed and get its config in one call
      if (!sessionId || !Number.isInteger(sessionId) || sessionId <= 0) {
        throw new Error("Invalid session ID");
      }
      const session = await apiClient.getSession(sessionId) as {
        completed: boolean;
        focus_duration: number;
        short_break_duration: number;
        long_break_duration: number;
        long_break_per_pomodoros: number;
      };
      if (session.completed) {
        throw new Error("Cannot start a completed session");
      }
      
      const previousSessionId = get().sessionId;
      await apiClient.startActiveSession(sessionId);
      set({ sessionId });
      // Apply settings directly from fetched session (avoid extra fetch)
      get().updateSettings({
        focus_duration: session.focus_duration,
        short_break_duration: session.short_break_duration,
        long_break_duration: session.long_break_duration,
        long_break_per_pomodoros: session.long_break_per_pomodoros,
      });
      set({ lastSettingsFromSessionId: sessionId, lastSettingsFetchedAt: Date.now() });
      
      await get().loadActiveSession();
      
      // Session start/switch analytics handled by backend
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
      
      if (configChanged && configSessionId && Number.isInteger(configSessionId) && configSessionId > 0) {
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
        // Use locally-synced settings to determine correct maxTime for the current phase
        const s = get().settings;
        if (activeSession.phase === "focus") {
          newMaxTime = s.focus_duration * 60;
        } else if (activeSession.phase === "short_break") {
          newMaxTime = s.short_break_duration * 60;
        } else if (activeSession.phase === "long_break") {
          newMaxTime = s.long_break_duration * 60;
        }
      } else {
        // Keep existing maxTime to preserve progress visualization
        newMaxTime = currentState.maxTime;
      }
      
      set({
        time: Number.isFinite(activeSession.time_remaining) && activeSession.time_remaining >= 0 ? activeSession.time_remaining : newMaxTime,
        maxTime: Number.isFinite(newMaxTime) && newMaxTime > 0 ? newMaxTime : (get().settings.focus_duration * 60),
        isRunning: activeSession.is_running,
        phase: activeSession.phase,
        currentTaskId: activeSession.current_task_id,
        sessionId: activeSession.session_id,
        pomodorosCompleted: activeSession.pomodoros_completed,
      });
      
      // If the session is running in focus phase, start task timing
      if (activeSession.is_running && activeSession.phase === "focus" && activeSession.current_task_id) {
        get().startTaskTimer(activeSession.current_task_id);
      }
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
        // Focus phase completed - pause task timer and add to total focus time
        get().pauseTaskTimer();
        const state = get();
        const focusTime = session.focus_duration * 60; // Get the full focus duration in seconds
        set({ totalFocusTime: state.totalFocusTime + focusTime });
        
        // Store total focus time in localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem('totalFocusTime', (state.totalFocusTime + focusTime).toString());
        }
        
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
        
        // Pomodoro completion is logged by backend when pomodoros_completed increases
      } else {
        // Break phase completed - move back to focus
        nextPhase = "focus";
        nextDuration = session.focus_duration * 60;
        
        // Resume task timer for focus phase
        const { currentTaskId } = get();
        get().startTaskTimer(currentTaskId || undefined);
        
        // Play focus resume sound
        try {
          const { useAppSettings } = await import('./settings');
          const { focusResumeSound } = useAppSettings.getState();
          const src = focusResumeSound.startsWith('/') ? focusResumeSound : `/audio/${focusResumeSound}`;
          const audio = new Audio(src);
          audio.volume = 0.8;
          audio.play().catch(() => {});
        } catch { /* ignore sound errors */ }
        
        // Send focus notification
        sendFocusNotification();
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
      const safeDuration = Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : (get().settings.focus_duration * 60);
      set({
        phase: nextPhase,
        time: safeDuration,
        maxTime: safeDuration,
        isRunning: true, // Continuous timer across phases
        pomodorosCompleted: newPomodorosCompleted,
        totalPomodorosCompleted: newTotalPomodorosCompleted
      });
      
      // Store total pomodoros in localStorage for persistence
      if (typeof window !== "undefined") {
        localStorage.setItem('totalPomodorosCompleted', newTotalPomodorosCompleted.toString());
      }
      
      // Phase change and break start are logged by backend in update_active_session
      
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
      
      // Analytics for updates handled server-side
    } catch (error) {
      // Failed to update timer - keep UI in sync
    } finally {
      set({ isLoading: false });
    }
  },

  setShowRestOverlay: async (show: boolean) => {
    const currentState = get();
    
    if (show && !currentState.showRestOverlay) {
      // Create overlay window when showing (only if not already showing)
      const { time } = get();
      set({ showRestOverlay: true });
      
      try {
        const overlayWindow = await useWindowStore.getState().createOverlayWindow(time);
        if (!overlayWindow) {
          // Overlay disabled via environment variable
          set({ showRestOverlay: false });
          return;
        }
      } catch (error) {
        // Failed to create overlay window - reset state
        set({ showRestOverlay: false });
      }
    } else if (!show && currentState.showRestOverlay) {
      // Close overlay window when hiding (only if currently showing)
      set({ showRestOverlay: false });
      
      try {
        await useWindowStore.getState().closeOverlayWindow();
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
      } catch { /* ignore analytics errors */ }
    } catch (error) {
      // On failure, ensure timer doesn't get stuck; leave existing state
    } finally {
      set({ isLoading: false });
    }
  },

  extendRest: async () => {
    const state = get();
    const { sessionId, phase, time, isRunning, settings, maxTime } = state;

    if (!sessionId) {
      console.error('No active session found for extend rest');
      return;
    }
    if (!(phase === 'short_break' || phase === 'long_break')) {
      // Only allow extending during breaks
      return;
    }

    // Extend by the original configured break duration
    const add = (phase === 'short_break' ? settings.short_break_duration : settings.long_break_duration) * 60;
    const newRemaining = time + add;
    const newMaxTime = (Number.isFinite(maxTime) && maxTime > 0 ? maxTime : add) + add;

    set({ isLoading: true });
    try {
      // Suppress background ticker sync briefly to avoid races
      _suppressSyncUntilMs = Date.now() + 1500;
      await apiClient.updateActiveSession({
        time_remaining: newRemaining,
        is_running: isRunning,
      });

      // Update local remaining time and expand maxTime to keep progress consistent
      set({ time: newRemaining, maxTime: newMaxTime });

      // Emit an event so the overlay window (separate process) can update its countdown
      try {
        if (isTauri()) {
          const { emit } = await import('@tauri-apps/api/event');
          await emit('break-extended', { added_seconds: add, time_remaining: newRemaining, phase });
        }
      } catch { /* ignore event emission failures */ }

      // Dispatch a DOM event for any in-page listeners (web)
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('break-extended', { detail: { added_seconds: add, time_remaining: newRemaining, phase } }));
        }
      } catch { /* ignore */ }

      // Log analytics and refresh stats
      try {
        useAnalyticsStore.getState().logEvent('break_extended', {
          session_id: sessionId,
          phase,
          added_seconds: add,
          new_remaining: newRemaining,
          at: new Date().toISOString(),
        });
        // Best-effort refresh for dashboards
        useAnalyticsStore.getState().updateTodayStats();
        useAnalyticsStore.getState().fetchEvents?.();
      } catch { /* ignore analytics issues */ }

      // Ensure the rest overlay stays open
      if (!get().showRestOverlay && isRunning) {
        try {
          set({ showRestOverlay: true });
          await useWindowStore.getState().createOverlayWindow(newRemaining);
        } catch {
          set({ showRestOverlay: false });
        }
      }
    } catch (error) {
      console.error('Failed to extend rest:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  triggerSessionCompletion: (sessionId, sessionName, totalTasks, completedTasks, focusDuration) => {
    // Show feedback UI and capture completion details
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

    // Immediately stop the timer and close any rest overlay to avoid lingering overlay
    try {
      // Stop local timer state first to ensure background ticker doesn't recreate overlay
      set({ isRunning: false });
      // Best-effort backend sync to pause active session
      apiClient.updateActiveSession({ is_running: false }).catch(() => { /* ignore */ });

      // If rest overlay is visible, close it now
      const state = get();
      if (state.showRestOverlay) {
        set({ showRestOverlay: false });
        try { useWindowStore.getState().closeOverlayWindow(); } catch { /* ignore */ }
      }
    } catch { /* non-fatal */ }
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

  // Time tracking methods
  resetTimeTracking: () => {
    set({ 
      totalFocusTime: 0, 
      currentTaskTime: 0, 
      taskStartTime: null 
    });
    if (typeof window !== "undefined") {
      localStorage.setItem('totalFocusTime', '0');
    }
  },

  startTaskTimer: (taskId?: number) => {
    const state = get();
    const now = Date.now();
    
    // If switching to a different task, add current task time to total and reset
    if (taskId && state.currentTaskId !== taskId) {
      if (state.taskStartTime && state.phase === "focus") {
        const sessionTime = Math.floor((now - state.taskStartTime) / 1000);
        set({ 
          currentTaskTime: 0,
          taskStartTime: now,
          currentTaskId: taskId
        });
      } else {
        set({ 
          currentTaskTime: 0,
          taskStartTime: now,
          currentTaskId: taskId
        });
      }
    } else if (!state.taskStartTime) {
      // Starting timer for first time or after pause
      set({ taskStartTime: now });
    }
  },

  pauseTaskTimer: () => {
    const state = get();
    if (state.taskStartTime && state.phase === "focus") {
      const now = Date.now();
      const sessionTime = Math.floor((now - state.taskStartTime) / 1000);
      set({ 
        currentTaskTime: state.currentTaskTime + sessionTime,
        taskStartTime: null
      });
    }
  },

  getTaskCompletionTime: () => {
    const state = get();
    let completionTime = state.currentTaskTime;
    
    // Add current session time if timer is running
    if (state.taskStartTime && state.phase === "focus") {
      const now = Date.now();
      const currentSessionTime = Math.floor((now - state.taskStartTime) / 1000);
      completionTime += currentSessionTime;
    }
    
    return Math.floor(completionTime / 60); // Return in minutes
  },

  resetTaskTimer: () => {
    set({ 
      currentTaskTime: 0, 
      taskStartTime: null 
    });
  },
  };
});
