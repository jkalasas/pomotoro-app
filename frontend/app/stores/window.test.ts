import { describe, it, expect, beforeEach } from 'vitest';
import { mockWindows, mockIPC } from '@tauri-apps/api/mocks';
import { useWindowStore } from './window';

describe('useWindowStore - overlay window', () => {
  beforeEach(() => {
    // Simulate a main window so getCurrentWindow etc. can resolve
    mockWindows('main');
  });

  it('creates and tracks an overlay WebviewWindow and clears on closeOverlayWindow()', async () => {
    // Mock IPC to let WebviewWindow creation succeed and respond to actions
    mockIPC((cmd) => {
      // Allow creating a webview window without throwing
      if (cmd === 'plugin:webview|create_webview_window') {
        return null;
      }
      // Allow window actions used in createOverlayWindow
      if (
        cmd === 'plugin:webview|maximize' ||
        cmd === 'plugin:webview|set_always_on_top' ||
        cmd === 'plugin:webview|set_focus' ||
        cmd === 'plugin:webview|set_fullscreen' ||
        cmd === 'plugin:webview|webview_close'
      ) {
        return null;
      }
      // Fallback noop
      return null;
    });

    const store = useWindowStore.getState();

    // Create overlay
    const overlay = await store.createOverlayWindow(120);
    expect(overlay).toBeTruthy();
    expect(useWindowStore.getState().overlayWindow).toBe(overlay);

  // Close via store method and ensure state clears
  await useWindowStore.getState().closeOverlayWindow();
    expect(useWindowStore.getState().overlayWindow).toBeUndefined();
  });
});
