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
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await apiClient.login(email, password);
          apiClient.setToken(response.access_token);
          set({ token: response.access_token });
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
        set({ user: null, token: null });
      },

      loadUser: async () => {
        if (!get().token) return;
        try {
          apiClient.setToken(get().token!);
          const user = (await apiClient.getCurrentUser()) as User;
          set({ user });
        } catch (error) {
          console.error("Failed to load user:", error);
          // Token might be invalid, clear it
          get().logout();
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token }),
    }
  )
);
