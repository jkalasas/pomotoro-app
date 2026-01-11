import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Sessions from './sessions';
import * as TaskStore from '~/stores/tasks';

// Mock child components to avoid complex DND or deep rendering issues
vi.mock('~/components/pomotoro/sessions/SessionList', () => ({
  SessionList: ({ sessions }: any) => (
    <div data-testid="session-list">
      Session List ({sessions.length})
    </div>
  ),
}));

vi.mock('~/components/pomotoro/sessions/SessionDetail', () => ({
  SessionDetail: ({ session }: any) => (
    <div data-testid="session-detail">
      {session ? `Detail: ${session.name}` : 'No Session Selected'}
    </div>
  ),
}));

vi.mock('~/components/ui/sidebar', () => ({
  SidebarTrigger: () => <button>Sidebar Trigger</button>,
}));

// Partial mock of useTaskStore using spyOn or direct mock logic
const mockLoadSessions = vi.fn();
const mockLoadArchivedSessions = vi.fn();
const mockGetSession = vi.fn();

vi.mock('~/stores/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof TaskStore>();
  return {
    ...actual,
    useTaskStore: vi.fn(),
  };
});

describe('Sessions Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (TaskStore.useTaskStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            sessions: [{ id: 1, name: 'Test Session', tasks: [] }],
            isLoading: false,
            loadSessions: mockLoadSessions,
            loadArchivedSessions: mockLoadArchivedSessions,
            getSession: mockGetSession,
            // Add other used methods as noops
            createSession: vi.fn(),
            updateSession: vi.fn(),
            deleteSession: vi.fn(),
            archiveSession: vi.fn(),
            unarchiveSession: vi.fn(),
            addTaskToSession: vi.fn(),
            completeTask: vi.fn(),
            uncompleteTask: vi.fn(),
            updateTask: vi.fn(),
            deleteTask: vi.fn(),
            reorderTasks: vi.fn(),
            moveCompletedAndArchivedToBottom: vi.fn(),
            archiveTask: vi.fn(),
            unarchiveTask: vi.fn(),
        });
    });

    it('renders the session list and title', () => {
        render(<Sessions />);
        
        expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
        expect(screen.getByTestId('session-list')).toBeInTheDocument();
        expect(screen.getByText('Session List (1)')).toBeInTheDocument();
        expect(screen.getByTestId('session-detail')).toBeInTheDocument();
        expect(screen.getByText('No Session Selected')).toBeInTheDocument();
        expect(mockLoadSessions).toHaveBeenCalled();
    });

    it('shows loading state', () => {
         (TaskStore.useTaskStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            sessions: [],
            isLoading: true,
            loadSessions: mockLoadSessions,
            loadArchivedSessions: mockLoadArchivedSessions, 
        });
        
        render(<Sessions />);
        expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });
});
