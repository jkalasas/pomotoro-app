const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private token: string | null = null;
  private refreshTokenCallback: (() => Promise<boolean>) | null = null;
  // In-flight request deduplication and a very short-lived cache to avoid bursty duplicate GETs
  private inflight: Map<string, Promise<any>> = new Map();
  private cache: Map<string, { timestamp: number; data: any }> = new Map();
  private readonly CACHE_TTL_MS = 1000; // 1s TTL is enough to collapse rapid duplicates

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  setRefreshTokenCallback(callback: () => Promise<boolean>) {
    this.refreshTokenCallback = callback;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Only set Content-Type to application/json if not already set
    if (!headers['Content-Type'] && options.body && typeof options.body === 'string' && !options.body.includes('=')) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    // Build a stable key for GET requests for dedup/cache
    const method = (options.method || 'GET').toUpperCase();
    const key = `${method} ${url}::${this.token || ''}`;

    // For GET requests, first try to serve from a tiny cache window
    if (method === 'GET') {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.data as T;
      }

      // If an identical request is in-flight, return the same promise
      const inflight = this.inflight.get(key);
      if (inflight) {
        return inflight as Promise<T>;
      }
    }

    const doFetch = fetch(url, { ...options, headers });
    if (method === 'GET') {
      this.inflight.set(key, doFetch);
    }

    const response = await doFetch;

    if (!response.ok) {
      // If we get a 401 and have a refresh callback, try to refresh the token
      if (response.status === 401 && this.refreshTokenCallback && retryCount === 0 && endpoint !== '/auth/token/refresh') {
        try {
          const refreshed = await this.refreshTokenCallback();
          if (refreshed) {
            // Retry the request with the new token
            return this.request<T>(endpoint, options, retryCount + 1);
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }
      
      const error = await response.text();
      if (method === 'GET') {
        this.inflight.delete(key);
      }
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    // Gracefully handle responses with no content (e.g., 204) or non-JSON bodies
    if (response.status === 204) {
      // No Content
      if (method === 'GET') {
        this.cache.set(key, { timestamp: Date.now(), data: undefined });
        this.inflight.delete(key);
      }
      return undefined as unknown as T;
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    const hasBody = contentLength === null || contentLength === undefined || contentLength === '0' ? false : true;

    if (!hasBody) {
      return undefined as unknown as T;
    }

    if (contentType.includes('application/json')) {
      const json = await response.json();
      if (method === 'GET') {
        this.cache.set(key, { timestamp: Date.now(), data: json });
        this.inflight.delete(key);
      }
      return json as T;
    }

    // Fallback: attempt to read text; if empty, return undefined
    const text = await response.text();
    if (!text) {
      if (method === 'GET') {
        this.cache.set(key, { timestamp: Date.now(), data: undefined });
        this.inflight.delete(key);
      }
      return undefined as unknown as T;
    }
    try {
      const parsed = JSON.parse(text) as T;
      if (method === 'GET') {
        this.cache.set(key, { timestamp: Date.now(), data: parsed });
        this.inflight.delete(key);
      }
      return parsed;
    } catch {
      // Return raw text when JSON parsing fails
      if (method === 'GET') {
        this.cache.set(key, { timestamp: Date.now(), data: text });
        this.inflight.delete(key);
      }
      return text as unknown as T;
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    // OAuth2PasswordRequestForm expects form data, not JSON
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await this.request<{
      access_token: string;
      refresh_token: string;
      token_type: string;
    }>('/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    this.setToken(response.access_token);
    return response;
  }

  async register(userData: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    password: string;
  }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const response = await this.request<{
      access_token: string;
      refresh_token: string;
      token_type: string;
    }>('/auth/token/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${refreshToken}`,
      },
    });

    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token
    };
  }

  // Session endpoints
  async createSession(sessionData: {
    name?: string;
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
      due_date?: string | null;
    }>;
  }) {
    return this.request('/sessions/', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async getSessions(includeArchived: boolean = false) {
    const query = includeArchived ? '?include_archived=true' : '';
    const result = await this.request(`/sessions/${query}`);
    return Array.isArray(result) ? result : [];
  }

  async getSession(sessionId: number, includeArchived: boolean = true) {
    if (!sessionId || !Number.isInteger(sessionId) || sessionId <= 0) {
      throw new Error(`Invalid sessionId: ${sessionId}`);
    }
    const query = includeArchived ? '?include_archived=true' : '';
    return this.request(`/sessions/${sessionId}${query}`);
  }

  async updateSession(sessionId: number, updates: { 
    name?: string; 
    description?: string;
    focus_duration?: number;
    short_break_duration?: number;
    long_break_duration?: number;
    long_break_per_pomodoros?: number;
  }) {
    return this.request(`/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteSession(sessionId: number) {
    return this.request(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async archiveSession(sessionId: number) {
    return this.request(`/sessions/${sessionId}/archive`, {
      method: 'POST',
    });
  }

  async unarchiveSession(sessionId: number) {
    return this.request(`/sessions/${sessionId}/unarchive`, {
      method: 'POST',
    });
  }

  // Active session endpoints
  async startActiveSession(sessionId: number) {
    return this.request('/sessions/active', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  }

  async getActiveSession() {
    return this.request('/sessions/active');
  }

  async updateActiveSession(updates: {
    is_running?: boolean;
    time_remaining?: number;
    phase?: string;
    current_task_id?: number;
    pomodoros_completed?: number;
  }) {
    return this.request('/sessions/active', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async stopActiveSession() {
    return this.request('/sessions/active', {
      method: 'DELETE',
    });
  }

  // Task endpoints
  async completeTask(taskId: number, actualCompletionTime?: number) {
    const body = actualCompletionTime !== undefined ? {
      actual_completion_time: actualCompletionTime
    } : undefined;
    
    return this.request(`/sessions/tasks/${taskId}/complete`, {
      method: 'PUT',
      ...(body && { body: JSON.stringify(body) }),
    });
  }

  async uncompleteTask(taskId: number) {
    return this.request(`/sessions/tasks/${taskId}/uncomplete`, {
      method: 'PUT',
    });
  }

  // Task management endpoints
  async addTaskToSession(sessionId: number, taskData: {
    name: string;
    category: string;
    estimated_completion_time: number;
    due_date?: string | null;
  }) {
    return this.request(`/sessions/${sessionId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }

  async updateTask(taskId: number, taskData: {
    name?: string;
    category?: string;
    estimated_completion_time?: number;
    due_date?: string | null;
  }) {
    return this.request(`/sessions/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
  }

  async deleteTask(taskId: number) {
    return this.request(`/sessions/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }

  async archiveTask(taskId: number) {
    return this.request(`/sessions/tasks/${taskId}/archive`, { method: 'POST' });
  }

  async unarchiveTask(taskId: number) {
    return this.request(`/sessions/tasks/${taskId}/unarchive`, { method: 'POST' });
  }

  async reorderTasks(sessionId: number, taskIds: number[]) {
    return this.request(`/sessions/${sessionId}/tasks/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ task_ids: taskIds }),
    });
  }

  // Session feedback
  async completeSession(sessionId: number, focusLevel: string, sessionReflection?: string) {
    return this.request(`/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        focus_level: focusLevel,
        session_reflection: sessionReflection,
      }),
    });
  }

  async getSessionFeedbacks(limit: number = 50) {
    return this.request(`/sessions/feedback?limit=${limit}`);
  }

  // Recommendations
  async getRecommendations(description: string) {
    return this.request('/recommendations/generate-tasks', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  async refineSession(description: string) {
    return this.request('/recommendations/refine-session', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  // Scheduler endpoints
  async generateSchedule(sessionIds: number[]) {
    return this.request('/scheduler/generate-schedule', {
      method: 'POST',
      body: JSON.stringify({ session_ids: sessionIds }),
    });
  }

  async getUserInsights() {
    return this.request('/scheduler/user-insights');
  }

  async updateDailyStats() {
    return this.request('/scheduler/update-daily-stats', {
      method: 'POST',
    });
  }

  async reorderSchedule(taskIds: number[]) {
    return this.request('/scheduler/reorder-schedule', {
      method: 'PUT',
      body: JSON.stringify({ task_ids: taskIds }),
    });
  }
}

export const apiClient = new ApiClient();
