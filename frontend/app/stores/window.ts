import { getCurrentWindow, PhysicalSize, Window } from "@tauri-apps/api/window";
import { create } from "zustand";

export interface Dimension {
  width: number;
  height: number;
}

export interface WindowState {
  isAlwaysOnTop: boolean;
  isFullscreen: boolean;
  size: Dimension;
  window?: Window;
  initWindow: () => Promise<void>;
  setAlwaysOnTop: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
  setSize: (dimension: Dimension) => void;
  toggleAlwaysOnTop: () => void;
  toggleFullscreen: () => void;
  updateWindow: (newWindow: Window) => Promise<void>;
}

export const useWindowStore = create<WindowState>((set, get) => ({
  isAlwaysOnTop: false,
  isFullscreen: false,
  size: { width: 0, height: 0 },
  initWindow: async () => {
    const currentState = get();
    if (!currentState.window) {
      const window = getCurrentWindow();
      await currentState.updateWindow(window);
    }
  },
  setAlwaysOnTop: (value) => {
    const { window } = get();
    window?.setAlwaysOnTop(value);

    set({ isAlwaysOnTop: value });
  },
  setFullscreen: (value) => {
    const { window } = get();
    window?.setFullscreen(value);

    set({ isFullscreen: value });
  },
  setSize: ({ width, height }) => {
    const { window } = get();
    window?.setSize(new PhysicalSize(width, height));
    set({ size: { width, height } });
  },
  toggleAlwaysOnTop: () => {
    const { isAlwaysOnTop, setAlwaysOnTop } = get();
    setAlwaysOnTop(!isAlwaysOnTop);
  },
  toggleFullscreen: () => {
    const { isFullscreen, setFullscreen } = get();
    setFullscreen(!isFullscreen);
  },
  updateWindow: async (newWindow) => {
    const size = await newWindow.innerSize();
    set({
      window: newWindow,
      isAlwaysOnTop: await newWindow.isAlwaysOnTop(),
      isFullscreen: await newWindow.isFullscreen(),
      size,
    });
  },
}));
