import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "~/lib/api";

interface User {
  id: number;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await apiClient.login(email, password);
          apiClient.setToken(response.access_token);
          set({ 
            token: response.access_token,
            refreshToken: response.refresh_token 
          });
          await get().loadUser();
        } catch (error) {
          console.error("Login failed:", error);
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          await apiClient.register(userData);
          // Auto login after registration
          await get().login(userData.email, userData.password);
        } catch (error) {
          console.error("Registration failed:", error);
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        apiClient.clearToken();
        set({ user: null, token: null, refreshToken: null });
      },

      loadUser: async () => {
        if (!get().token) return;
        try {
          apiClient.setToken(get().token!);
          const user = (await apiClient.getCurrentUser()) as User;
          set({ user });
        } catch (error) {
          console.error("Failed to load user:", error);
          // Try to refresh token before logging out
          const refreshed = await get().refreshAccessToken();
          if (refreshed) {
            // Retry loading user with the new token
            try {
              const user = (await apiClient.getCurrentUser()) as User;
              set({ user });
            } catch (retryError) {
              console.error("Failed to load user after refresh:", retryError);
              get().logout();
            }
          } else {
            get().logout();
          }
        }
      },

      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) {
          return false;
        }

        try {
          const tokens = await apiClient.refreshToken(refreshToken);
          apiClient.setToken(tokens.access_token);
          set({ 
            token: tokens.access_token,
            refreshToken: tokens.refresh_token 
          });
          return true;
        } catch (error) {
          console.error("Failed to refresh token:", error);
          get().logout();
          return false;
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ 
        token: state.token, 
        refreshToken: state.refreshToken 
      }),
      onRehydrateStorage: () => (state) => {
        // Set the token in the API client when the store is rehydrated
        if (state?.token) {
          apiClient.setToken(state.token);
        }
      },
    }
  )
);
