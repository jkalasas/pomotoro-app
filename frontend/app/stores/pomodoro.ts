import { create } from "zustand";
import {
  persist,
  createJSONStorage,
} from "zustand/middleware";
import { LazyStore } from "@tauri-apps/plugin-store";

export const pomodoroStore = new LazyStore("pomodoro.json", { autoSave: true });

const storage = createJSONStorage(() => ({
  getItem: async (name) => {
    return (await pomodoroStore.get(name)) || null;
  },
  setItem: async (name, value) => {
    await pomodoroStore.set(name, value);
  },
  removeItem: async (name) => {
    await pomodoroStore.delete(name);
  },
}));

export interface PomodoroState {
  _timer?: ReturnType<typeof setTimeout>;
  isRunning: boolean;
  time: number;
  maxTime: number;
  onTimesUp?: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  startTimer: () => void;
  setIsRunning: (value: boolean) => void;
  setOnTimesUp: (onTimesUp: () => void) => void;
  setTime: (time: number) => void;
  setMaxTime: (maxTime: number) => void;
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      time: 0,
      maxTime: 0,
      pauseTimer: () => {
        clearInterval(get()._timer);
        set({ isRunning: false, _timer: undefined });
      },
      resetTimer: () => {
        const { _timer, maxTime } = get();
        clearInterval(_timer);
        set({ time: maxTime, isRunning: false, _timer: undefined });
      },
      startTimer: () => {
        clearInterval(get()._timer);

        set({
          _timer: setInterval(() => {
            const { time, onTimesUp, resetTimer } = get();

            if (time > 0) {
              set({ time: time - 1 });
            } else {
              onTimesUp?.();
              resetTimer();
            }
          }, 1000),
          isRunning: true,
        });
      },
      setIsRunning: (value) => set({ isRunning: value }),
      setOnTimesUp: (onTimesUp) => set({ onTimesUp }),
      setTime: (time) => set({ time }),
      setMaxTime: (maxTime) => set({ maxTime }),
    }),
    {
      storage,
      name: "pomodoro-storage",
      partialize: (state) => ({ time: state.time, maxTime: state.maxTime }),
    }
  )
);
