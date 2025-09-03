const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Analytics API types
export interface AnalyticsEvent {
  id: number;
  event_type: string;
  event_data: string | null;
  created_at: string;
}

export interface SessionAnalytics {
  id: number;
  session_id: number;
  total_focus_time: number;
  total_break_time: number;
  pomodoros_completed: number;
  tasks_completed: number;
  session_started_at: string;
  session_ended_at: string | null;
  estimated_vs_actual_ratio: number | null;
  interruptions_count: number;
  completion_rate: number | null;
}

export interface DailyStats {
  id: number;
  date: string;
  total_focus_time: number;
  total_break_time: number;
  sessions_completed: number;
  tasks_completed: number;
  pomodoros_completed: number;
  average_focus_duration: number | null;
  interruptions_count: number;
  productivity_score: number | null;
}

export interface ProductivityInsights {
  most_productive_time: string | null;
  average_session_length: number;
  completion_rate_trend: string;
  focus_time_trend: string;
  recommendations: string[];
}

export interface ChartDataPoint {
  date: string;
  focus_time?: number;
  break_time?: number;
  completed?: number;
  sessions?: number;
  productivity?: number;
}

export interface SessionDurationData {
  range: string;
  count: number;
}

export interface AnalyticsDashboard {
  daily_stats: DailyStats[];
  weekly_stats: any[];
  productivity_insights: ProductivityInsights;
  recent_events: AnalyticsEvent[];
  focus_time_trend: ChartDataPoint[];
  task_completion_trend: ChartDataPoint[];
  productivity_heatmap: ChartDataPoint[];
  session_duration_distribution: SessionDurationData[];
}

class AnalyticsAPI {
  private baseUrl = `${API_BASE_URL}/analytics`;

  private getToken(): string | null {
    // Try to get token from Zustand persist storage (same key as auth store)
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        return parsed?.state?.token || null;
      }
    } catch (error) {
      console.error('Failed to get token from auth storage:', error);
    }
    
    // Fallback to direct localStorage access
    return localStorage.getItem('access_token');
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = this.getToken();
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Analytics API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async logEvent(eventType: string, eventData?: Record<string, any>): Promise<AnalyticsEvent> {
    return this.request<AnalyticsEvent>('/events', {
      method: 'POST',
      body: JSON.stringify({
        event_type: eventType,
        event_data: eventData,
      }),
    });
  }

  async getEvents(eventType?: string, days = 7): Promise<AnalyticsEvent[]> {
    const params = new URLSearchParams({ days: days.toString() });
    if (eventType) params.append('event_type', eventType);
    
    return this.request<AnalyticsEvent[]>(`/events?${params}`);
  }

  async getDailyStats(days = 30): Promise<DailyStats[]> {
    return this.request<DailyStats[]>(`/daily-stats?days=${days}`);
  }

  async getSessionAnalytics(days = 30): Promise<SessionAnalytics[]> {
    return this.request<SessionAnalytics[]>(`/session-analytics?days=${days}`);
  }

  async getProductivityInsights(days = 30): Promise<ProductivityInsights> {
    return this.request<ProductivityInsights>(`/insights?days=${days}`);
  }

  async getDashboard(days = 30): Promise<AnalyticsDashboard> {
    return this.request<AnalyticsDashboard>(`/dashboard?days=${days}`);
  }

  async updateDailyStats(targetDate?: string): Promise<{ message: string; date: string }> {
    const body = targetDate ? { target_date: targetDate } : {};
    return this.request<{ message: string; date: string }>('/update-daily-stats', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async startSessionTracking(sessionId: number): Promise<{ message: string; analytics_id: number }> {
    return this.request<{ message: string; analytics_id: number }>(`/session/${sessionId}/start`, {
      method: 'POST',
    });
  }

  async endSessionTracking(sessionId: number): Promise<{ message: string; analytics_id: number | null }> {
    return this.request<{ message: string; analytics_id: number | null }>(`/session/${sessionId}/end`, {
      method: 'POST',
    });
  }
}

export const analyticsAPI = new AnalyticsAPI();
