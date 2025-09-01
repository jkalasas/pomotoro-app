import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PartialK } from "~/types/partial";
import type { Task } from "~/types/task";

export const taskStore = new LazyStore("tasks.json", { autoSave: true });

const storage = createJSONStorage(
  () => ({
    getItem: async (name) => {
      return (await taskStore.get(name)) || null;
    },
    setItem: async (name, value) => {
      await taskStore.set(name, value);
    },
    removeItem: async (name) => {
      await taskStore.delete(name);
    },
  }),
  {
    reviver: (key, value) => {
      if (key === "tasks") {
        return (value as Task[]).map((task) => ({
          ...task,
          createdAt: new Date(task.createdAt),
        }));
      }

      return value;
    },
    replacer: (key, value) => {
      if (key === "tasks") {
        return (value as Task[]).map((task) => ({
          ...task,
          createdAt: task.createdAt.toISOString(),
        }));
      }

      return value;
    },
  }
);

export interface TaskState {
  tasks: Task[];
  getOrderedTasks: () => Task[];
  addTask: (task: PartialK<Task, "id" | "completed" | "createdAt">) => void;
  removeTask: (id: string) => void;
  updateTask: (id: string, updatedTask: Partial<Task>) => void;
  completeTask: (id: string) => void;
  clearCompletedTasks: () => void;
  setTasks: (tasks: Task[]) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      addTask: (task) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              ...task,
              id:
                task.id ??
                `${Date.now().toString(36)}-${Math.random()
                  .toString(36)
                  .substring(2)}`,
              completed: task.completed ?? false,
              createdAt: task.createdAt ?? new Date(),
            },
          ],
        })),
      removeTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        })),
      updateTask: (id, updatedTask) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updatedTask } : task
          ),
        })),
      completeTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, completed: true } : task
          ),
        })),
      clearCompletedTasks: () =>
        set((state) => ({
          tasks: state.tasks.filter((task) => !task.completed),
        })),
      setTasks: (tasks) => set({ tasks }),
      getOrderedTasks: () =>
        get().tasks.sort((a, b) => {
          const aHasOrder = a.order !== undefined;
          const bHasOrder = b.order !== undefined;

          // If they have different order status
          if (aHasOrder !== bHasOrder) {
            return aHasOrder ? -1 : 1;
          }

          // If both have order
          if (aHasOrder) {
            return a.order! - b.order!;
          }

          // If neither has order, sort by createdAt
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }),
    }),
    {
      name: "task-storage",
      storage,
      partialize: (state) => ({ tasks: state.tasks }),
    }
  )
);
