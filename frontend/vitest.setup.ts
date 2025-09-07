// Vitest setup for Tauri front-end tests
import { afterEach, beforeAll } from 'vitest';
import { randomFillSync } from 'crypto';
import { clearMocks } from '@tauri-apps/api/mocks';
import '@testing-library/jest-dom/vitest';

// jsdom doesn't include WebCrypto by default
beforeAll(() => {
  // @ts-ignore - jsdom window typing
  if (!window.crypto?.getRandomValues) {
    Object.defineProperty(window, 'crypto', {
      value: {
        // @ts-ignore
        getRandomValues: (buffer: ArrayBufferView) => randomFillSync(buffer as unknown as Buffer)
      }
    });
  }
});

// Ensure mocks are reset between tests
afterEach(() => {
  clearMocks();
});
