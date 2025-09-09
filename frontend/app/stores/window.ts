import { getCurrentWindow, PhysicalSize, PhysicalPosition, Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { create } from "zustand";
import { showOverlay } from "~/lib/env";

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
  createOverlayWindow: (timeRemaining: number) => Promise<WebviewWindow | null>;
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
    // Check if overlay is enabled via environment variable
    if (!showOverlay()) {
      console.log('Overlay disabled via VITE_SHOW_OVERLAY environment variable');
      return null as any; // Return a dummy value to maintain interface compatibility
    }

    try {
      console.log('Starting overlay window creation...', { timeRemaining });
      
      // Close existing overlay if it exists
      const { overlayWindow } = get();
      console.log('Current overlay window state:', overlayWindow);
      
      if (overlayWindow) {
        console.log('Closing existing overlay window...');
        try {
          await overlayWindow.close();
          console.log('Existing overlay closed successfully');
        } catch (e) {
          console.log('Previous overlay window already closed or error:', e);
        }
        // Always clear the reference
        set({ overlayWindow: undefined });
        console.log('Overlay reference cleared');
        
        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Creating new overlay window...');
      
      // Create a new overlay window with simple configuration
      const windowLabel = `rest-overlay-${Date.now()}`;
      console.log('Using window label:', windowLabel);
      
      const newOverlayWindow = new WebviewWindow(windowLabel, {
        url: `overlay?time=${timeRemaining}`,
        title: 'Rest Overlay',
        width: 800,  // Start with reasonable size
        height: 600,
        decorations: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        transparent: false,
        visible: true,
        center: true,
        fullscreen: true
      });

      console.log('WebviewWindow instance created:', newOverlayWindow);

      console.log('WebviewWindow instance created');

      // Listen for window events
      newOverlayWindow.once('tauri://created', async () => {
        console.log('Overlay window created successfully');
        try {
          // Maximize the window to fill screen
          await newOverlayWindow.maximize();
          await newOverlayWindow.setAlwaysOnTop(true);
          await newOverlayWindow.setFocus();
          
          console.log('Window maximized and configured');
          
          // Try fullscreen as additional step
          try {
            await newOverlayWindow.setFullscreen(true);
            console.log('Fullscreen set successfully');
          } catch (fsError) {
            console.warn('Fullscreen failed, using maximized window:', fsError);
          }
          
          console.log('Overlay window configured successfully');
        } catch (error) {
          console.error('Failed to configure overlay window:', error);
        }
      });

      newOverlayWindow.once('tauri://error', (error) => {
        console.error('Overlay window creation error:', error);
        set({ overlayWindow: undefined });
      });

      // Listen for window close events to update state
      newOverlayWindow.once('tauri://close-requested', () => {
        console.log('Overlay window close requested');
        set({ overlayWindow: undefined });
      });

      // Listen for destroyed event as well
      newOverlayWindow.once('tauri://destroyed', () => {
        console.log('Overlay window destroyed');
        set({ overlayWindow: undefined });
      });

      console.log('Setting overlay window in state...');
      set({ overlayWindow: newOverlayWindow });
      console.log('Overlay window creation completed');
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
      } catch (error) {
        console.error('Failed to close overlay window:', error);
      } finally {
        // Always clear the overlay reference
        set({ overlayWindow: undefined });
      }
    }
  },
}));
