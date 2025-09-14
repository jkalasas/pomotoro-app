import { create } from "zustand";
import { apiClient } from "~/lib/api";
import { useAnalyticsStore } from "./analytics";

export interface Task {
  id: number;
  name: string;
  estimated_completion_time: number;
  category: string;
  completed: boolean;
  actual_completion_time: number | null;
  archived?: boolean;
  archived_at?: string | null;
}

export interface Session {
  id: number;
  name: string;
  description: string;
  focus_duration: number;
  short_break_duration: number;
  long_break_duration: number;
  long_break_per_pomodoros: number;
  completed?: boolean;
  completed_at?: string;
  archived?: boolean;
  archived_at?: string | null;
  tasks: Task[];
}

interface TaskState {
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  refreshAllData: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadArchivedSessions: () => Promise<Session[]>;
  loadSession: (sessionId: number) => Promise<void>;
  getSession: (sessionId: number) => Promise<Session>;
  createSession: (sessionData: {
    name?: string;
    description: string;
    pomodoro_config: {
      focus_duration: number;
      short_break_duration: number;
      long_break_duration: number;
      long_break_per_pomodoros: number;
    };
    tasks: Array<{
      name: string;
      category: string;
      estimated_completion_time: number;
    }>;
  }) => Promise<Session>;
  updateSession: (sessionId: number, updates: { 
    name?: string; 
    description?: string;
    focus_duration?: number;
    short_break_duration?: number;
    long_break_duration?: number;
    long_break_per_pomodoros?: number;
  }) => Promise<void>;
  deleteSession: (sessionId: number) => Promise<void>;
  archiveSession: (sessionId: number) => Promise<void>;
  unarchiveSession: (sessionId: number) => Promise<void>;
  completeTask: (taskId: number) => Promise<void>;
  uncompleteTask: (taskId: number) => Promise<void>;
  completeSessionManually: () => Promise<void>;
  setCurrentSession: (session: Session | null) => void;
  // Task management methods
  addTaskToSession: (sessionId: number, taskData: {
    name: string;
    category: string;
    estimated_completion_time: number;
  }) => Promise<void>;
  updateTask: (taskId: number, taskData: {
    name?: string;
    category?: string;
    estimated_completion_time?: number;
  }) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  reorderTasks: (sessionId: number, taskIds: number[]) => Promise<void>;
  moveCompletedAndArchivedToBottom: (sessionId: number) => Promise<void>;
  archiveTask: (taskId: number) => Promise<void>;
  unarchiveTask: (taskId: number) => Promise<void>;
  // New method for handling next task with pomodoro config updates
  handleNextTaskTransition: (completedTaskId: number) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  sessions: [],
  currentSession: null,
  isLoading: false,

  // Helper function to refresh all relevant data
  refreshAllData: async () => {
    const currentSessionId = get().currentSession?.id;
    await get().loadSessions();
    if (currentSessionId) {
      await get().loadSession(currentSessionId);
    }
  },

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await apiClient.getSessions(false) as Session[] | any;
      const sessionsArray: Session[] = Array.isArray(sessions) ? sessions : [];
      // Ensure all sessions have a tasks array
      const sessionsWithTasks = sessionsArray.map(session => ({
        ...session,
        tasks: session.tasks || []
      }));
      set({ sessions: sessionsWithTasks });
    } catch (error) {
      console.error("Failed to load sessions:", error);
      set({ sessions: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  loadArchivedSessions: async () => {
    try {
      const sessions = await apiClient.getSessions(true) as Session[] | any;
      const sessionsArray: Session[] = Array.isArray(sessions) ? sessions : [];
      return sessionsArray.filter(s => s.archived);
    } catch (e) {
      return [];
    }
  },

  loadSession: async (sessionId: number) => {
    if (!sessionId || !Number.isInteger(sessionId) || sessionId <= 0) {
      console.error("Invalid session ID:", sessionId);
      return;
    }
    set({ isLoading: true });
    try {
      const session = await apiClient.getSession(sessionId, true) as Session;
      // Ensure session has a tasks array
      const sessionWithTasks = {
        ...session,
        tasks: session.tasks || []
      };
      set({ currentSession: sessionWithTasks });
    } catch (error) {
      console.error("Failed to load session:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  getSession: async (sessionId: number) => {
    if (!sessionId || !Number.isInteger(sessionId) || sessionId <= 0) {
      const err = new Error(`Invalid session ID: ${sessionId}`);
      console.error("Failed to get session:", err);
      throw err;
    }
    try {
      const session = await apiClient.getSession(sessionId, true) as Session;
      // Ensure session has a tasks array
      return {
        ...session,
        tasks: session.tasks || []
      };
    } catch (error) {
      console.error("Failed to get session:", error);
      throw error;
    }
  },

  createSession: async (sessionData) => {
    set({ isLoading: true });
    try {
      const session = await apiClient.createSession(sessionData) as Session;
      await get().loadSessions(); // Refresh sessions list
      return session;
    } catch (error) {
      console.error("Failed to create session:", error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  updateSession: async (sessionId: number, updates) => {
    set({ isLoading: true });
    try {
      await apiClient.updateSession(sessionId, updates);
      await get().loadSessions(); // Refresh sessions list
      // If this is the current session, reload it
      const currentSession = get().currentSession;
      if (currentSession && currentSession.id === sessionId) {
        await get().loadSession(sessionId);
      }
    } catch (error) {
      console.error("Failed to update session:", error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  completeTask: async (taskId: number) => {
    try {
      // Get actual completion time from pomodoro store
      const { usePomodoroStore } = await import('./pomodoro');
      const pomodoroStore = usePomodoroStore.getState();
      const actualCompletionTime = pomodoroStore.getTaskCompletionTime();
      
      await apiClient.completeTask(taskId, actualCompletionTime);
      
      // Reflect completion in the current schedule if present (optimistic UI sync)
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const schedState = useSchedulerStore.getState();
        const schedule = schedState.currentSchedule;
        if (schedule && schedule.some(t => t.id === taskId && !t.completed)) {
          const updated = schedule.map(t => t.id === taskId ? { ...t, completed: true } : t);
          useSchedulerStore.setState({ currentSchedule: updated });
        }
      } catch {}

      // Handle next task transition for pomodoro configuration updates
      await get().handleNextTaskTransition(taskId);
      
      // Resolve the session that owns this task using the scheduler when available
      let targetSessionId: number | null = null;
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const sched = useSchedulerStore.getState();
        const schedTask = sched.currentSchedule?.find(t => t.id === taskId);
        if (schedTask) targetSessionId = schedTask.session_id;
      } catch {}

      // Fallback to current session if scheduler couldn't resolve
      const currentSession = get().currentSession;
      if (!targetSessionId && currentSession) targetSessionId = currentSession.id;

      // Get task details for analytics logging (from currentSession if available)
      const task = currentSession?.tasks.find(t => t.id === taskId);

      // Task completion analytics logged by backend; skip client log to avoid duplicates
      
      // Independently verify completion on the ACTUAL session for this task (include archived tasks)
      try {
        if (targetSessionId) {
          const targetSession = await get().getSession(targetSessionId);
          const allTasks = targetSession.tasks || [];
          const allTasksCompleted = allTasks.length > 0 && allTasks.every(t => t.completed);
          const completedTasksCount = allTasks.filter(t => t.completed).length;
          if (allTasksCompleted && completedTasksCount > 0) {
            const focusDuration = Math.floor(
              allTasks.reduce((sum, t) => sum + (t.actual_completion_time || t.estimated_completion_time), 0) / 60
            );
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent('session-completion', {
                detail: {
                  sessionId: targetSession.id,
                  sessionName: targetSession.name || targetSession.description,
                  totalTasks: allTasks.length,
                  completedTasks: completedTasksCount,
                  focusDuration
                }
              }));
            }
          }
        }
      } catch {}

  // Avoid redundant full refresh here; UI is updated optimistically and
  // specific reloads happen via events and scheduler/pomodoro sync.
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('task-completed'));
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
      throw error;
    }
  },

  uncompleteTask: async (taskId: number) => {
    try {
      const response = await apiClient.uncompleteTask(taskId) as { message: string; session_reset: boolean };
      // Reflect uncompletion in the current schedule if present (optimistic UI sync)
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const schedState = useSchedulerStore.getState();
        const schedule = schedState.currentSchedule;
        if (schedule && schedule.some(t => t.id === taskId && t.completed)) {
          const updated = schedule.map(t => t.id === taskId ? { ...t, completed: false } : t);
          useSchedulerStore.setState({ currentSchedule: updated });
        }
      } catch {}
      
      // If task is not in schedule but its session is selected, insert it respecting session order
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const sched = useSchedulerStore.getState();
        const currentSchedule = sched.currentSchedule;
        if (currentSchedule) {
          // Find the session containing this task and the task details
          const state = get();
          let foundSession: Session | undefined;
          let foundTask: Task | undefined;
          // Search in currentSession first for performance
          if (state.currentSession && state.currentSession.tasks?.some(t => t.id === taskId)) {
            foundSession = state.currentSession;
            foundTask = state.currentSession.tasks.find(t => t.id === taskId);
          }
          // Fallback: scan all loaded sessions
          if (!foundTask) {
            for (const s of state.sessions) {
              const ft = (s.tasks || []).find(t => t.id === taskId);
              if (ft) { foundSession = s; foundTask = ft; break; }
            }
          }

          if (foundSession && foundTask && sched.selectedSessionIds.includes(foundSession.id)) {
            const alreadyInSchedule = currentSchedule.some(t => t.id === taskId);
            if (!alreadyInSchedule) {
              // Compute insertion index using session task order
              const sessionTasks = (foundSession.tasks || []);
              const newIndexInSession = sessionTasks.findIndex(t => t.id === taskId);
              const siblings = currentSchedule.filter(t => t.session_id === foundSession!.id);
              let insertAt = currentSchedule.length; // default append
              if (siblings.length > 0) {
                // Map siblings to their order in the session
                const siblingWithOrder = siblings.map(st => ({
                  st,
                  order: sessionTasks.findIndex(t => t.id === st.id)
                })).filter(x => x.order !== -1);
                const prev = siblingWithOrder
                  .filter(x => x.order < newIndexInSession)
                  .sort((a,b) => b.order - a.order)[0];
                const next = siblingWithOrder
                  .filter(x => x.order > newIndexInSession)
                  .sort((a,b) => a.order - b.order)[0];
                if (prev) {
                  insertAt = currentSchedule.findIndex(t => t.id === prev.st.id) + 1;
                } else if (next) {
                  insertAt = currentSchedule.findIndex(t => t.id === next.st.id);
                }
              }

              const newScheduledTask = {
                id: foundTask.id,
                name: (foundTask.name || '').trim() || 'Untitled Task',
                estimated_completion_time: foundTask.estimated_completion_time,
                session_id: foundSession.id,
                category: foundTask.category || 'Uncategorized',
                completed: false,
                archived: false,
              };

              const reordered = [...currentSchedule];
              reordered.splice(insertAt, 0, newScheduledTask);

              // Persist reorder via scheduler helper to keep timer consistent
              try {
                const { usePomodoroStore } = await import('./pomodoro');
                const wasRunning = usePomodoroStore.getState().isRunning;
                await useSchedulerStore.getState().reorderScheduleWithTimerReset(reordered, wasRunning);
              } catch {}
            }
          }
        }
      } catch {}
      
      // Get task details for analytics logging
      const currentSession = get().currentSession;
      const task = currentSession?.tasks.find(t => t.id === taskId);
      
      if (task && currentSession) {
        // Log task uncompletion analytics
        useAnalyticsStore.getState().logTaskUncomplete(
          taskId, 
          task.name, 
          currentSession.id, 
          response.session_reset
        );
        
        // If session was reset, log that too
        if (response.session_reset) {
          useAnalyticsStore.getState().logSessionReset(
            currentSession.id,
            "task_uncompleted"
          );
        }
      }
      
      // Refresh current session to get updated task status
      if (currentSession) {
        await get().refreshAllData();
        
        // Check if session was reset due to uncompleting the task
        if (response.session_reset) {
          // Session was reset, need to reload pomodoro state
          // Dispatch event to notify other parts of the app
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('session-reset', {
              detail: { sessionId: currentSession.id, taskId }
            }));
          }
        }
      }
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('task-uncompleted'));
      }

      // After uncompletion, ensure Pomodoro adopts the latest current task's config
      try {
        const { usePomodoroStore } = await import('./pomodoro');
        await usePomodoroStore.getState().syncConfigWithCurrentTask();
      } catch {}
    } catch (error) {
      console.error("Failed to uncomplete task:", error);
      throw error;
    }
  },

  completeSessionManually: async () => {
    const currentSession = get().currentSession;
    if (!currentSession) {
      throw new Error("No active session to complete");
    }

    const allTasks = currentSession.tasks || [];
    const completedTasksCount = allTasks.filter(t => t.completed).length;
    const focusDuration = Math.floor(
      allTasks.reduce((sum, t) => sum + (t.actual_completion_time || t.estimated_completion_time), 0) / 60
    );
    
    // Trigger session completion via custom event
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('session-completion', {
        detail: {
          sessionId: currentSession.id,
          sessionName: currentSession.name || currentSession.description,
          totalTasks: allTasks.length,
          completedTasks: completedTasksCount,
          focusDuration
        }
      }));
    }
  },

  setCurrentSession: (session: Session | null) => set({ currentSession: session }),

  deleteSession: async (sessionId: number) => {
    try {
      await apiClient.deleteSession(sessionId);
      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter(session => session.id !== sessionId),
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
      }));
    } catch (error) {
      console.error("Failed to delete session:", error);
      throw error;
    }
  },

  archiveSession: async (sessionId: number) => {
    try {
      await apiClient.archiveSession(sessionId);
      set((state) => ({
        sessions: state.sessions.filter(s => s.id !== sessionId), // remove from active list
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
      }));
    } catch (e) {
      console.error('Failed to archive session', e);
      throw e;
    }
  },

  unarchiveSession: async (sessionId: number) => {
    try {
      await apiClient.unarchiveSession(sessionId);
      // reload sessions
      await get().loadSessions();
    } catch (e) {
      console.error('Failed to unarchive session', e);
      throw e;
    }
  },

  addTaskToSession: async (sessionId: number, taskData) => {
    try {
      // Normalize empty names to avoid unnamed tasks leaking into schedule/UI
      const normalized = {
        ...taskData,
        name: (taskData.name || "").trim() || "Untitled Task",
      };
      const newTask = await apiClient.addTaskToSession(sessionId, normalized) as Task;
      // Update the local state by adding the task to the session
      set((state) => ({
        sessions: state.sessions.map(session =>
          session.id === sessionId
            ? { ...session, tasks: [...(session.tasks || []), newTask] }
            : session
        ),
        currentSession: state.currentSession?.id === sessionId
          ? { ...state.currentSession, tasks: [...(state.currentSession.tasks || []), newTask] }
          : state.currentSession,
      }));

      // If this session is part of the current schedule, append the new task to the bottom
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const sched = useSchedulerStore.getState();
        const currentSchedule = sched.currentSchedule;
        if (currentSchedule && sched.selectedSessionIds.includes(sessionId)) {
          const newScheduledTask = {
            id: newTask.id,
            name: (newTask.name || '').trim() || 'Untitled Task',
            estimated_completion_time: newTask.estimated_completion_time,
            session_id: sessionId,
            category: newTask.category || 'Uncategorized',
            completed: false,
            archived: !!newTask.archived,
          };

          const reordered = [...currentSchedule, newScheduledTask];

          // Persist reorder and keep Pomodoro state consistent
          try {
            const { usePomodoroStore } = await import('./pomodoro');
            const wasRunning = usePomodoroStore.getState().isRunning;
            await useSchedulerStore.getState().reorderScheduleWithTimerReset(reordered, wasRunning);
          } catch {}
        }
      } catch {}
    } catch (error) {
      console.error("Failed to add task:", error);
      throw error;
    }
  },

  updateTask: async (taskId: number, taskData) => {
    try {
      // Normalize empty names to a safe default
      const normalized = {
        ...taskData,
        ...(typeof taskData.name !== 'undefined' ? { name: (taskData.name || "").trim() || "Untitled Task" } : {}),
      };
      const updatedTask = await apiClient.updateTask(taskId, normalized) as Task;
      // Update the local state
      set((state) => ({
        sessions: state.sessions.map(session => ({
          ...session,
          tasks: (session.tasks || []).map(task =>
            task.id === taskId ? updatedTask : task
          ),
        })),
        currentSession: state.currentSession ? {
          ...state.currentSession,
          tasks: (state.currentSession.tasks || []).map(task =>
            task.id === taskId ? updatedTask : task
          ),
        } : null,
      }));

      // Also sync any scheduled task instance so Home/schedule reflect edits immediately
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const schedState = useSchedulerStore.getState();
        const currentSchedule = schedState.currentSchedule;
        if (currentSchedule && currentSchedule.some(t => t.id === taskId)) {
          const updatedSchedule = currentSchedule.map(t =>
            t.id === taskId
              ? {
                  ...t,
                  name: updatedTask.name,
                  estimated_completion_time: updatedTask.estimated_completion_time,
                  category: updatedTask.category,
                  archived: updatedTask.archived,
                }
              : t
          );
          useSchedulerStore.setState({ currentSchedule: updatedSchedule });
        }
      } catch (e) {
        // Non-fatal: schedule sync failed
      }
    } catch (error) {
      console.error("Failed to update task:", error);
      throw error;
    }
  },

  deleteTask: async (taskId: number) => {
    try {
      await apiClient.deleteTask(taskId);
      // Remove from local state
      set((state) => ({
        sessions: state.sessions.map(session => ({
          ...session,
          tasks: (session.tasks || []).filter(task => task.id !== taskId),
        })),
        currentSession: state.currentSession ? {
          ...state.currentSession,
          tasks: (state.currentSession.tasks || []).filter(task => task.id !== taskId),
        } : null,
      }));

      // If the task is in the current schedule, remove it there too
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const schedState = useSchedulerStore.getState();
        const currentSchedule = schedState.currentSchedule;
        if (currentSchedule && currentSchedule.some(t => t.id === taskId)) {
          const updatedSchedule = currentSchedule.filter(t => t.id !== taskId);
          useSchedulerStore.setState({ currentSchedule: updatedSchedule });
        }
      } catch (e) {
        // Non-fatal
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
      throw error;
    }
  },

  reorderTasks: async (sessionId: number, taskIds) => {
    try {
      await apiClient.reorderTasks(sessionId, taskIds);
      // Update the local state to reflect the new order
      set((state) => ({
        sessions: state.sessions.map(session => {
          if (session.id === sessionId && session.tasks) {
            const taskMap = new Map(session.tasks.map(task => [task.id, task]));
            const reorderedTasks = taskIds.map(id => taskMap.get(id)).filter(Boolean) as Task[];
            return { ...session, tasks: reorderedTasks };
          }
          return session;
        }),
        currentSession: state.currentSession?.id === sessionId && state.currentSession?.tasks ? (() => {
          const taskMap = new Map(state.currentSession.tasks.map(task => [task.id, task]));
          const reorderedTasks = taskIds.map(id => taskMap.get(id)).filter(Boolean) as Task[];
          return { ...state.currentSession, tasks: reorderedTasks };
        })() : state.currentSession,
      }));
    } catch (error) {
      console.error("Failed to reorder tasks:", error);
      throw error;
    }
  },

  moveCompletedAndArchivedToBottom: async (sessionId: number) => {
    try {
      const state = get();
      const session = state.sessions.find(s => s.id === sessionId);
      if (!session?.tasks) return;

      // Separate tasks into active and completed/archived
      const activeTasks = session.tasks.filter(task => !task.completed && !task.archived);
      const completedOrArchivedTasks = session.tasks.filter(task => task.completed || task.archived);
      
      // Create new order with active tasks first, then completed/archived
      const reorderedTasks = [...activeTasks, ...completedOrArchivedTasks];
      const taskIds = reorderedTasks.map(task => task.id);
      
      // Use the existing reorderTasks function to apply the changes to backend
      await get().reorderTasks(sessionId, taskIds);
    } catch (error) {
      console.error("Failed to move completed and archived tasks to bottom:", error);
      throw error;
    }
  },

  archiveTask: async (taskId: number) => {
    try {
      const updated = await apiClient.archiveTask(taskId) as Task;
      set((state) => ({
        sessions: state.sessions.map(s => ({...s, tasks: s.tasks?.map(t => t.id===taskId?updated:t) || []})),
        currentSession: state.currentSession ? { ...state.currentSession, tasks: state.currentSession.tasks.map(t => t.id===taskId?updated:t) } : null,
      }));
      // If archiving this task results in all tasks being completed, trigger session completion
      try {
        const current = get().currentSession;
        if (current) {
          const allTasks = current.tasks || [];
          const allTasksCompleted = allTasks.length > 0 && allTasks.every(t => t.completed);
          if (allTasksCompleted) {
            const completedTasksCount = allTasks.filter(t => t.completed).length;
            const focusDuration = Math.floor(
              allTasks.reduce((sum, t) => sum + (t.actual_completion_time || t.estimated_completion_time), 0) / 60
            );
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent('session-completion', {
                detail: {
                  sessionId: current.id,
                  sessionName: current.name || current.description,
                  totalTasks: allTasks.length,
                  completedTasks: completedTasksCount,
                  focusDuration
                }
              }));
            }
          }
        }
      } catch {}
      // Remove archived task from current schedule view
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const sched = useSchedulerStore.getState();
        const cur = sched.currentSchedule;
        if (cur && cur.some(t => t.id === taskId)) {
          const updatedSchedule = cur.filter(t => t.id !== taskId);
          useSchedulerStore.setState({ currentSchedule: updatedSchedule });
          // If the archived task was active, switch Pomodoro to the next available task
          try {
            const { usePomodoroStore } = await import('./pomodoro');
            const pomodoro = usePomodoroStore.getState();
            if (pomodoro.currentTaskId === taskId) {
              const next = useSchedulerStore.getState().getCurrentTask();
              await pomodoro.updateTimer({ current_task_id: next ? next.id : undefined });
            }
          } catch {}
        }
      } catch {}
    } catch (e) { console.error('archive task failed', e); }
  },
  unarchiveTask: async (taskId: number) => {
    try {
      const updated = await apiClient.unarchiveTask(taskId) as Task;
      set((state) => ({
        sessions: state.sessions.map(s => ({...s, tasks: s.tasks?.map(t => t.id===taskId?updated:t) || []})),
        currentSession: state.currentSession ? { ...state.currentSession, tasks: state.currentSession.tasks.map(t => t.id===taskId?updated:t) } : null,
      }));

      // If task's session is part of current schedule and task not present, insert it by session order
      try {
        const { useSchedulerStore } = await import('./scheduler');
        const sched = useSchedulerStore.getState();
        const currentSchedule = sched.currentSchedule;
        if (!currentSchedule) return;

        // Locate session and task details
        const state = get();
        let foundSession: Session | undefined;
        let foundTask: Task | undefined;
        if (state.currentSession && state.currentSession.tasks?.some(t => t.id === taskId)) {
          foundSession = state.currentSession;
          foundTask = state.currentSession.tasks.find(t => t.id === taskId);
        }
        if (!foundTask) {
          for (const s of state.sessions) {
            const ft = (s.tasks || []).find(t => t.id === taskId);
            if (ft) { foundSession = s; foundTask = ft; break; }
          }
        }

        if (foundSession && foundTask && sched.selectedSessionIds.includes(foundSession.id)) {
          const alreadyInSchedule = currentSchedule.some(t => t.id === taskId);
          if (!alreadyInSchedule) {
            const sessionTasks = (foundSession.tasks || []);
            const newIndexInSession = sessionTasks.findIndex(t => t.id === taskId);
            const siblings = currentSchedule.filter(t => t.session_id === foundSession!.id);
            let insertAt = currentSchedule.length;
            if (siblings.length > 0) {
              const siblingWithOrder = siblings.map(st => ({
                st,
                order: sessionTasks.findIndex(t => t.id === st.id)
              })).filter(x => x.order !== -1);
              const prev = siblingWithOrder
                .filter(x => x.order < newIndexInSession)
                .sort((a,b) => b.order - a.order)[0];
              const next = siblingWithOrder
                .filter(x => x.order > newIndexInSession)
                .sort((a,b) => a.order - b.order)[0];
              if (prev) {
                insertAt = currentSchedule.findIndex(t => t.id === prev.st.id) + 1;
              } else if (next) {
                insertAt = currentSchedule.findIndex(t => t.id === next.st.id);
              }
            }

            const newScheduledTask = {
              id: foundTask.id,
              name: (foundTask.name || '').trim() || 'Untitled Task',
              estimated_completion_time: foundTask.estimated_completion_time,
              session_id: foundSession.id,
              category: foundTask.category || 'Uncategorized',
              completed: !!foundTask.completed,
              archived: false,
            };

            const reordered = [...currentSchedule];
            reordered.splice(insertAt, 0, newScheduledTask);

            try {
              const { usePomodoroStore } = await import('./pomodoro');
              const wasRunning = usePomodoroStore.getState().isRunning;
              await useSchedulerStore.getState().reorderScheduleWithTimerReset(reordered, wasRunning);
            } catch {}
          }
        }
      } catch {}
    } catch (e) { console.error('unarchive task failed', e); }
  },

  // New method for handling next task with pomodoro config updates
  handleNextTaskTransition: async (completedTaskId: number) => {
    try {
      const { usePomodoroStore } = await import('./pomodoro');
      const { useSchedulerStore } = await import('./scheduler');
      
      // Get the current schedule to find next task
      const schedulerState = useSchedulerStore.getState();
      const currentSchedule = schedulerState.currentSchedule;
      
      if (!currentSchedule) {
        return;
      }
      
      // Find the completed task and the next task
      const completedTaskIndex = currentSchedule.findIndex(task => task.id === completedTaskId);
      const nextTask = currentSchedule.find((task, index) => 
        index > completedTaskIndex && !task.completed
      );
      
  // Get the current pomodoro state BEFORE any updates
  const pomodoroStore = usePomodoroStore.getState();
      
      // Reset the task timer after completing the previous task
      pomodoroStore.resetTaskTimer();
      
      if (!nextTask) {
        return;
      }
      const currentTime = pomodoroStore.time;
      const currentPhase = pomodoroStore.phase;
      const isRunning = pomodoroStore.isRunning;
      const currentTimeRemaining = pomodoroStore.time; // This is the actual remaining time
      
      // Get the current and next task sessions
      const completedTask = currentSchedule[completedTaskIndex];
      const currentSessionId = completedTask?.session_id;
      const nextSessionId = nextTask.session_id;
      
      // Build a single minimal backend update to avoid duplicate 'timer_start' logs
      if (isRunning && currentPhase === "focus") {
        let newTimeRemaining = currentTimeRemaining;
        if (currentSessionId !== nextSessionId) {
          await pomodoroStore.updateSettingsFromTask(nextSessionId);
          const updatedSettings = usePomodoroStore.getState().settings;
          const nextSessionFocusSeconds = updatedSettings.focus_duration * 60;
          if (newTimeRemaining > nextSessionFocusSeconds) {
            newTimeRemaining = nextSessionFocusSeconds;
          }
        }

        await pomodoroStore.updateTimer({
          current_task_id: nextTask.id,
          time_remaining: newTimeRemaining,
        });

        // Start local task timer without additional backend calls
        pomodoroStore.startTaskTimer(nextTask.id);
      } else {
        await pomodoroStore.updateTimer({
          current_task_id: nextTask.id,
        });
      }
    } catch (error) {
      // Failed to handle next task transition
    }
  },
}));
