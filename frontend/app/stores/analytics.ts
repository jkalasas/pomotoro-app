import { create } from 'zustand';
import { analyticsAPI, type AnalyticsEvent, type DailyStats, type ProductivityInsights } from '~/lib/analytics';

// Performance optimization: Queue and batch analytics events
interface QueuedEvent {
  eventType: string;
  eventData?: Record<string, any>;
  timestamp: number;
}

let eventQueue: QueuedEvent[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

// Debounced analytics for high-frequency events like timer updates
const debouncedEvents = new Map<string, NodeJS.Timeout>();

// Helper for debounced logging
const debouncedLog = (key: string, eventType: string, eventData?: Record<string, any>, delay = 5000) => {
  if (debouncedEvents.has(key)) {
    clearTimeout(debouncedEvents.get(key)!);
  }
  
  const timeout = setTimeout(() => {
    eventQueue.push({
      eventType,
      eventData,
      timestamp: Date.now()
    });
    debouncedEvents.delete(key);
  }, delay);
  
  debouncedEvents.set(key, timeout);
};

// Batch size and delay for performance
const BATCH_SIZE = 10;
const FLUSH_DELAY = 2000; // 2 seconds

interface AnalyticsState {
  // State
  events: AnalyticsEvent[];
  dailyStats: DailyStats[];
  insights: ProductivityInsights | null;
  loading: boolean;
  
  // Actions
  logEvent: (eventType: string, eventData?: Record<string, any>) => void; // Made synchronous for performance
  logEventDebounced: (key: string, eventType: string, eventData?: Record<string, any>, delay?: number) => void;
  flushEvents: () => Promise<void>;
  fetchEvents: (eventType?: string, days?: number) => Promise<void>;
  fetchDailyStats: (days?: number) => Promise<void>;
  fetchInsights: (days?: number) => Promise<void>;
  updateDailyStats: (targetDate?: string) => Promise<void>;
  updateTodayStats: () => Promise<void>;
  
  // Convenience methods for common events - now synchronous for performance
  logSessionStart: (sessionId: number, sessionName: string) => void;
  logSessionSwitch: (fromSessionId: number, toSessionId: number) => void;
  logSessionComplete: (sessionId: number, focusLevel: string, tasksCompleted: number, totalTasks: number) => void;
  logSessionReset: (sessionId: number, reason: string) => void;
  logTaskComplete: (taskId: number, taskName: string, sessionId?: number) => void;
  logTaskUncomplete: (taskId: number, taskName: string, sessionId?: number, sessionReset?: boolean) => void;
  logFeedbackSubmitted: (sessionId: number, focusLevel: string, reflection?: string) => void;
  logPomodoroComplete: (sessionId: number, pomodorosCompleted: number) => void;
  logTimerStart: (sessionId: number, phase: string) => void;
  logTimerPause: (sessionId: number, phase: string) => void;
  logBreakStart: (sessionId: number, breakType: string) => void;
  
  // New comprehensive event tracking methods - now synchronous for performance  
  logUserAction: (action: string, context?: Record<string, any>) => void;
  logSessionGeneration: (projectDetails: string, success: boolean, taskCount?: number) => void;
  logScheduleGeneration: (taskCount: number, totalTime: number, success: boolean) => void;
  logTaskEdit: (taskId: number, changeType: string, details?: Record<string, any>) => void;
  logNavigationEvent: (fromPage: string, toPage: string) => void;
  logTimerReset: (sessionId: number, phase: string, timeRemaining: number) => void;
  logBreakSkip: (sessionId: number, breakType: string) => void;
  logModalOpen: (modalType: string, context?: Record<string, any>) => void;
  logModalClose: (modalType: string, action: string) => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => {
  // Optimized event flushing function
  const flushEvents = async () => {
    if (eventQueue.length === 0) return;
    
    const eventsToFlush = eventQueue.splice(0, eventQueue.length);
    
    try {
      // Process events in parallel for better performance
      await Promise.allSettled(
        eventsToFlush.map(event => 
          analyticsAPI.logEvent(event.eventType, event.eventData).catch(() => {
            // Silently fail analytics to not affect user experience
          })
        )
      );
    } catch (error) {
      // Silently fail analytics to not affect user experience
      console.debug('Analytics batch failed:', error);
    }
  };

  // Auto-flush mechanism
  const scheduleFlush = () => {
    if (flushTimeout) clearTimeout(flushTimeout);
    
    if (eventQueue.length >= BATCH_SIZE) {
      // Flush immediately if batch is full
      flushEvents();
    } else {
      // Schedule flush after delay
      flushTimeout = setTimeout(flushEvents, FLUSH_DELAY);
    }
  };

  return {
    // Initial state
    events: [],
    dailyStats: [],
    insights: null,
    loading: false,
    
    // Base actions
    logEvent: (eventType: string, eventData?: Record<string, any>) => {
      // Queue event instead of sending immediately - massive performance improvement
      eventQueue.push({
        eventType,
        eventData,
        timestamp: Date.now()
      });
      
      scheduleFlush();
    },

    // For high-frequency events like timer updates
    logEventDebounced: (key: string, eventType: string, eventData?: Record<string, any>, delay = 5000) => {
      debouncedLog(key, eventType, eventData, delay);
      scheduleFlush();
    },

    flushEvents,

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

    updateDailyStats: async (targetDate?: string) => {
      try {
        await analyticsAPI.updateDailyStats(targetDate);
        // Refresh daily stats after update
        get().fetchDailyStats();
      } catch (error) {
        console.error('Failed to update daily stats:', error);
      }
    },

    updateTodayStats: async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await analyticsAPI.updateDailyStats(today);
        await get().fetchDailyStats();
      } catch (error) {
        // Non-fatal
      }
    },

    // Convenience methods for common events - now synchronous and non-blocking
    // Backed by server logs; frontend no-op to avoid duplicates
    logSessionStart: (_sessionId: number, _sessionName: string) => {
      // intentionally left blank — backend logs session_start
    },

    logSessionSwitch: (_fromSessionId: number, _toSessionId: number) => {
      // intentionally left blank — backend logs session_switch
    },

    logTaskComplete: (_taskId: number, _taskName: string, _sessionId?: number) => {
      // backend logs task_complete; keep frontend silent to avoid duplication
    },

    logPomodoroComplete: (_sessionId: number, _pomodorosCompleted: number) => {
      // backend logs pomodoro_complete
    },

    logTimerStart: (_sessionId: number, _phase: string) => {
      // backend logs timer_start when is_running toggles
    },

    logTimerPause: (_sessionId: number, _phase: string) => {
      // backend logs timer_pause
    },

    logBreakStart: (_sessionId: number, _breakType: string) => {
      // backend logs break_start on phase change
    },

    logSessionComplete: (_sessionId: number, _focusLevel: string, _tasksCompleted: number, _totalTasks: number) => {
      // backend logs session_complete; keep frontend silent to avoid duplication
    },

    logSessionReset: (sessionId: number, reason: string) => {
      get().logEvent('session_reset_frontend', {
        session_id: sessionId,
        reason,
        reset_time: new Date().toISOString()
      });
    },

    logTaskUncomplete: (_taskId: number, _taskName: string, _sessionId?: number, _sessionReset?: boolean) => {
      // intentionally left blank — backend logs task_uncomplete; keep frontend silent to avoid duplication
    },

    logFeedbackSubmitted: (sessionId: number, focusLevel: string, reflection?: string) => {
      get().logEvent('feedback_submitted', {
        session_id: sessionId,
        focus_level: focusLevel,
        has_reflection: !!reflection,
        reflection_length: reflection?.length || 0,
        submission_time: new Date().toISOString()
      });
    },

    // New comprehensive event tracking methods - now synchronous and non-blocking
    logUserAction: (action: string, context?: Record<string, any>) => {
      get().logEvent('user_action', {
        action,
        timestamp: new Date().toISOString(),
        ...context
      });
    },

    logSessionGeneration: (projectDetails: string, success: boolean, taskCount?: number) => {
      get().logEvent('session_generation', {
        project_details: projectDetails,
        success,
        task_count: taskCount,
        generation_time: new Date().toISOString()
      });
    },

    logScheduleGeneration: (taskCount: number, totalTime: number, success: boolean) => {
      get().logEvent('schedule_generation', {
        task_count: taskCount,
        total_time: totalTime,
        success,
        generation_time: new Date().toISOString()
      });
    },

    logTaskEdit: (taskId: number, changeType: string, details?: Record<string, any>) => {
      get().logEvent('task_edit', {
        task_id: taskId,
        change_type: changeType,
        edit_time: new Date().toISOString(),
        ...details
      });
    },

    logNavigationEvent: (fromPage: string, toPage: string) => {
      get().logEvent('navigation', {
        from_page: fromPage,
        to_page: toPage,
        navigation_time: new Date().toISOString()
      });
    },

    logTimerReset: (sessionId: number, phase: string, timeRemaining: number) => {
      get().logEvent('timer_reset', {
        session_id: sessionId,
        phase,
        time_remaining: timeRemaining,
        reset_time: new Date().toISOString()
      });
    },

    logBreakSkip: (sessionId: number, breakType: string) => {
      get().logEvent('break_skip', {
        session_id: sessionId,
        break_type: breakType,
        skip_time: new Date().toISOString()
      });
    },

    logModalOpen: (modalType: string, context?: Record<string, any>) => {
      get().logEvent('modal_open', {
        modal_type: modalType,
        open_time: new Date().toISOString(),
        ...context
      });
    },

    logModalClose: (modalType: string, action: string) => {
      get().logEvent('modal_close', {
        modal_type: modalType,
        close_action: action,
        close_time: new Date().toISOString()
      });
    },
  };
});
