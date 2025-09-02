import { create } from "zustand";
import { apiClient } from "~/lib/api";

export interface DailyProgress {
  rest_time_minutes: number;
  daily_goal_sessions: number;
  completed_tasks: number;
  completed_sessions: number;
  date: string;
}

interface DailyProgressState {
  progress: DailyProgress | null;
  isLoading: boolean;
  error: string | null;
  loadDailyProgress: () => Promise<void>;
  refreshProgress: () => void;
}

export const useDailyProgressStore = create<DailyProgressState>((set, get) => ({
  progress: null,
  isLoading: false,
  error: null,

  loadDailyProgress: async () => {
    set({ isLoading: true, error: null });
    try {
      const progress = await apiClient.getDailyProgress() as DailyProgress;
      set({ progress, error: null });
    } catch (error) {
      console.error("Failed to load daily progress:", error);
      let errorMessage = "Failed to load daily progress";
      
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("Not authenticated")) {
          errorMessage = "Please log in to view progress";
        } else {
          errorMessage = error.message;
        }
      }
      
      set({ error: errorMessage, progress: null });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshProgress: () => {
    // Non-blocking refresh
    get().loadDailyProgress();
  },
}));
