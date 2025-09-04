import { create } from 'zustand';
import { analyticsAPI, type AnalyticsEvent, type DailyStats, type ProductivityInsights } from '~/lib/analytics';

interface AnalyticsState {
  // State
  events: AnalyticsEvent[];
  dailyStats: DailyStats[];
  insights: ProductivityInsights | null;
  loading: boolean;
  
  // Actions
  logEvent: (eventType: string, eventData?: Record<string, any>) => Promise<void>;
  fetchEvents: (eventType?: string, days?: number) => Promise<void>;
  fetchDailyStats: (days?: number) => Promise<void>;
  fetchInsights: (days?: number) => Promise<void>;
  updateDailyStats: () => Promise<void>;
  
  // Convenience methods for common events
  logSessionStart: (sessionId: number, sessionName: string) => Promise<void>;
  logSessionSwitch: (fromSessionId: number, toSessionId: number) => Promise<void>;
  logSessionComplete: (sessionId: number, focusLevel: string, tasksCompleted: number, totalTasks: number) => Promise<void>;
  logSessionReset: (sessionId: number, reason: string) => Promise<void>;
  logTaskComplete: (taskId: number, taskName: string, sessionId?: number) => Promise<void>;
  logTaskUncomplete: (taskId: number, taskName: string, sessionId?: number, sessionReset?: boolean) => Promise<void>;
  logFeedbackSubmitted: (sessionId: number, focusLevel: string, reflection?: string) => Promise<void>;
  logPomodoroComplete: (sessionId: number, pomodorosCompleted: number) => Promise<void>;
  logTimerStart: (sessionId: number, phase: string) => Promise<void>;
  logTimerPause: (sessionId: number, phase: string) => Promise<void>;
  logBreakStart: (sessionId: number, breakType: string) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // Initial state
  events: [],
  dailyStats: [],
  insights: null,
  loading: false,
  
  // Base actions
  logEvent: async (eventType: string, eventData?: Record<string, any>) => {
    try {
      const event = await analyticsAPI.logEvent(eventType, eventData);
      set((state) => ({
        events: [event, ...state.events].slice(0, 50) // Keep only recent 50 events
      }));
    } catch (error) {
      console.error('Failed to log analytics event:', error);
    }
  },

  fetchEvents: async (eventType?: string, days = 7) => {
    try {
      set({ loading: true });
      const events = await analyticsAPI.getEvents(eventType, days);
      set({ events, loading: false });
    } catch (error) {
      console.error('Failed to fetch analytics events:', error);
      set({ loading: false });
    }
  },

  fetchDailyStats: async (days = 30) => {
    try {
      set({ loading: true });
      const dailyStats = await analyticsAPI.getDailyStats(days);
      set({ dailyStats, loading: false });
    } catch (error) {
      console.error('Failed to fetch daily stats:', error);
      set({ loading: false });
    }
  },

  fetchInsights: async (days = 30) => {
    try {
      const insights = await analyticsAPI.getProductivityInsights(days);
      set({ insights });
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    }
  },

  updateDailyStats: async () => {
    try {
      await analyticsAPI.updateDailyStats();
      // Refresh daily stats after update
      get().fetchDailyStats();
    } catch (error) {
      console.error('Failed to update daily stats:', error);
    }
  },

  // Convenience methods for common events
  logSessionStart: async (sessionId: number, sessionName: string) => {
    await get().logEvent('session_start', {
      session_id: sessionId,
      session_name: sessionName,
      start_time: new Date().toISOString()
    });
    
    // Start session tracking
    try {
      await analyticsAPI.startSessionTracking(sessionId);
    } catch (error) {
      console.error('Failed to start session tracking:', error);
    }
  },

  logSessionSwitch: async (fromSessionId: number, toSessionId: number) => {
    await get().logEvent('session_switch', {
      from_session_id: fromSessionId,
      to_session_id: toSessionId,
      switch_time: new Date().toISOString()
    });
    
    // End tracking for previous session and start for new one
    try {
      await analyticsAPI.endSessionTracking(fromSessionId);
      await analyticsAPI.startSessionTracking(toSessionId);
    } catch (error) {
      console.error('Failed to switch session tracking:', error);
    }
  },

  logTaskComplete: async (taskId: number, taskName: string, sessionId?: number) => {
    await get().logEvent('task_complete', {
      task_id: taskId,
      task_name: taskName,
      session_id: sessionId,
      completion_time: new Date().toISOString()
    });
  },

  logPomodoroComplete: async (sessionId: number, pomodorosCompleted: number) => {
    await get().logEvent('pomodoro_complete', {
      session_id: sessionId,
      pomodoros_completed: pomodorosCompleted,
      completion_time: new Date().toISOString()
    });
  },

  logTimerStart: async (sessionId: number, phase: string) => {
    await get().logEvent('timer_start', {
      session_id: sessionId,
      phase,
      start_time: new Date().toISOString()
    });
  },

  logTimerPause: async (sessionId: number, phase: string) => {
    await get().logEvent('timer_pause', {
      session_id: sessionId,
      phase,
      pause_time: new Date().toISOString()
    });
  },

  logBreakStart: async (sessionId: number, breakType: string) => {
    await get().logEvent('break_start', {
      session_id: sessionId,
      break_type: breakType,
      start_time: new Date().toISOString()
    });
  },

  logSessionComplete: async (sessionId: number, focusLevel: string, tasksCompleted: number, totalTasks: number) => {
    await get().logEvent('session_complete_frontend', {
      session_id: sessionId,
      focus_level: focusLevel,
      tasks_completed: tasksCompleted,
      total_tasks: totalTasks,
      completion_rate: totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0,
      completion_time: new Date().toISOString()
    });
  },

  logSessionReset: async (sessionId: number, reason: string) => {
    await get().logEvent('session_reset_frontend', {
      session_id: sessionId,
      reason,
      reset_time: new Date().toISOString()
    });
  },

  logTaskUncomplete: async (taskId: number, taskName: string, sessionId?: number, sessionReset?: boolean) => {
    await get().logEvent('task_uncomplete_frontend', {
      task_id: taskId,
      task_name: taskName,
      session_id: sessionId,
      session_reset: sessionReset,
      uncomplete_time: new Date().toISOString()
    });
  },

  logFeedbackSubmitted: async (sessionId: number, focusLevel: string, reflection?: string) => {
    await get().logEvent('feedback_submitted', {
      session_id: sessionId,
      focus_level: focusLevel,
      has_reflection: !!reflection,
      reflection_length: reflection?.length || 0,
      submission_time: new Date().toISOString()
    });
  },
}));
