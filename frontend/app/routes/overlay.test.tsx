import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockWindows, mockIPC } from '@tauri-apps/api/mocks';
import Overlay from './overlay';

// Mock react-router useSearchParams to control query
vi.mock('react-router', async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    useSearchParams: () => [{ get: (k: string) => (k === 'time' ? '120' : null) }],
  };
});

describe('Overlay route', () => {
  beforeEach(() => {
    mockWindows('overlay');
    mockIPC((cmd, args) => {
      // Allow getCurrentWindow().close() to resolve
      if (cmd === 'plugin:webview|webview_close') return null;
      // Allow event emit
      if (cmd === 'plugin:event|emit') return null;
      return null;
    });
  });

  it('renders minutes from query and emits skip-rest on click', async () => {
    const { container } = render(<Overlay />);
    expect(container).toHaveTextContent('MINUTES REMAINING');
    expect(container).toHaveTextContent('2'); // 120 seconds -> 2 minutes

  // Spy on tauri invoke underlying calls
  // @ts-ignore - available in Tauri test environment
  const invokeSpy = vi.spyOn(window.__TAURI_INTERNALS__, 'invoke');

    // Click Skip
    const btn = await screen.findByRole('button', { name: /skip rest/i });
    fireEvent.click(btn);

    await waitFor(() => {
      // Ensure event emit was invoked
      expect(invokeSpy).toHaveBeenCalledWith(
        'plugin:event|emit',
        expect.objectContaining({ event: 'skip-rest' }),
        undefined
      );
      // Ensure close was called on current window
      expect(invokeSpy).toHaveBeenCalledWith(
        'plugin:window|close',
        expect.any(Object),
        undefined
      );
    });
  });
});
