import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './home';
import { SidebarProvider } from '~/components/ui/sidebar';

// Mock localStorage globals
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', { ...window, localStorage: localStorageMock });

// Polyfill ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  transformCallback: vi.fn(),
}));

// Mock child components
vi.mock('~/components/pomotoro/home/TimerDisplay', () => ({
  TimerDisplay: () => <div data-testid="timer-display">TimerDisplay</div>,
}));

vi.mock('~/components/pomotoro/home/TimerControls', () => ({
  TimerControls: () => <div data-testid="timer-controls">TimerControls</div>,
}));

// Mock sidebar elements
vi.mock('~/components/ui/sidebar', async (importOriginal) => {
    const actual = await importOriginal<typeof import('~/components/ui/sidebar')>();
    return {
        ...actual,
        SidebarTrigger: () => <div>SidebarTrigger</div>
    }
});

// Mock Stores entirely (hoisted automatically by vitest)
vi.mock('~/stores/tasks', () => ({
  useTaskStore: vi.fn(() => ({
    sessions: [],
    currentSession: null,
    loadSessions: vi.fn(),
    loadSession: vi.fn(),
    refreshAllData: vi.fn(),
  })),
}));

vi.mock('~/stores/pomodoro', () => ({
  usePomodoroStore: vi.fn((selector) => {
      const state = {
          settings: { focus_duration: 25 },
          phase: 'focus',
          sessionId: null,
          updateSettings: vi.fn(),
          loadActiveSession: vi.fn(),
          resetTimer: vi.fn(),
          isRunning: false,
          time: 1500,
          maxTime: 1500,
          showRestOverlay: false,
          isLoading: false
      };
      return selector ? selector(state) : state;
  }),
}));

vi.mock('~/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 1, email: 'test@example.com' },
    loadUser: vi.fn(),
    token: 'fake-token'
  })),
}));

vi.mock('~/stores/scheduler', () => ({
  useSchedulerStore: vi.fn(() => ({
     currentSchedule: [],
     clearSchedule: vi.fn(),
     getCurrentTask: () => ({ id: 1, name: 'Task 1' }),
     getAdjustedSchedule: () => [],
  })),
  AdjustedScheduledTask: {},
}));

describe('Home Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the dashboard components', () => {
        render(
            <SidebarProvider>
                <Home />
            </SidebarProvider>
        );
        
        expect(screen.getByTestId('timer-display')).toBeInTheDocument();
        expect(screen.getByTestId('timer-controls')).toBeInTheDocument();
        expect(screen.getByText('Schedule')).toBeInTheDocument();
        expect(screen.getByText('Quick Checklist')).toBeInTheDocument();
    });
});
