import { getCurrentWindow, PhysicalSize, PhysicalPosition, Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { create } from "zustand";

export interface Dimension {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface WindowState {
  isAlwaysOnTop: boolean;
  isFullscreen: boolean;
  size: Dimension;
  position: Position;
  window?: Window;
  overlayWindow?: WebviewWindow;
  initWindow: () => Promise<void>;
  setAlwaysOnTop: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
  setSize: (dimension: Dimension) => void;
  setPosition: (position: Position) => void;
  toggleAlwaysOnTop: () => void;
  toggleFullscreen: () => void;
  updateWindow: (newWindow: Window) => Promise<void>;
  createOverlayWindow: (timeRemaining: number) => Promise<WebviewWindow>;
  closeOverlayWindow: () => Promise<void>;
}

export const useWindowStore = create<WindowState>((set, get) => ({
  isAlwaysOnTop: false,
  isFullscreen: false,
  size: { width: 0, height: 0 },
  position: { x: 0, y: 0 },
  overlayWindow: undefined,
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
  setPosition: ({ x, y }) => {
    const { window } = get();
    window?.setPosition(new PhysicalPosition(x, y));
    set({ position: { x, y } });
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
    const position = await newWindow.outerPosition();
    set({
      window: newWindow,
      isAlwaysOnTop: await newWindow.isAlwaysOnTop(),
      isFullscreen: await newWindow.isFullscreen(),
      size,
      position,
    });
  },
  
  createOverlayWindow: async (timeRemaining: number) => {
    try {
      console.log('Starting overlay window creation...');
      
      // Close existing overlay if it exists
      const { overlayWindow } = get();
      if (overlayWindow) {
        try {
          await overlayWindow.close();
        } catch (e) {
          console.log('Previous overlay window already closed');
        }
      }

      // Create a new overlay window with simpler configuration first
      const newOverlayWindow = new WebviewWindow('rest-overlay-' + Date.now(), {
        url: 'overlay',
        title: 'Rest Overlay',
        width: 800,
        height: 600,
        center: true,
        decorations: false,
        alwaysOnTop: true,
      });

      console.log('WebviewWindow instance created');

      // Listen for window events
      newOverlayWindow.once('tauri://created', () => {
        console.log('Overlay window created successfully');
        // After successful creation, make it fullscreen
        newOverlayWindow.setFullscreen(true);
      });

      newOverlayWindow.once('tauri://error', (error) => {
        console.error('Overlay window creation error:', error);
      });

      set({ overlayWindow: newOverlayWindow });
      return newOverlayWindow;
    } catch (error) {
      console.error('Failed to create overlay window:', error);
      throw error;
    }
  },

  closeOverlayWindow: async () => {
    const { overlayWindow } = get();
    if (overlayWindow) {
      try {
        await overlayWindow.close();
        set({ overlayWindow: undefined });
      } catch (error) {
        console.error('Failed to close overlay window:', error);
      }
    }
  },
}));
