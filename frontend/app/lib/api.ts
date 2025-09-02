const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
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

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    return response.json();
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

  // Session endpoints
  async createSession(sessionData: {
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
    }>;
  }) {
    return this.request('/sessions/', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async getSessions() {
    return this.request('/sessions/');
  }

  async getSession(sessionId: number) {
    return this.request(`/sessions/${sessionId}`);
  }

  async updateSession(sessionId: number, updates: { name?: string; description?: string }) {
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
  async completeTask(taskId: number) {
    return this.request(`/sessions/tasks/${taskId}/complete`, {
      method: 'PUT',
    });
  }

  // Recommendations
  async getRecommendations(description: string) {
    return this.request('/recommendations/generate-tasks', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }
}

export const apiClient = new ApiClient();
