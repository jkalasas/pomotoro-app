import { memo } from "react";
import {
  DragDropContext,
  Droppable,
  type DropResult,
  type DroppableProvided,
} from "@hello-pangea/dnd";
import { Button } from "~/components/ui/button";
import { Target, Plus, ArrowDown } from "lucide-react";
import type { Task } from "~/stores/tasks";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  tasks: Task[];
  filter: "all" | "active" | "completed" | "archived";
  onFilterChange: (filter: "all" | "active" | "completed" | "archived") => void;
  onDragEnd: (result: DropResult) => void;
  onAddTask: () => void;
  onMoveCompletedToBottom: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: number) => void;
  onArchiveTask: (taskId: number) => void;
  onUnarchiveTask: (taskId: number) => void;
  onToggleComplete: (task: Task) => void;
}

export const TaskList = memo(function TaskList({
  tasks,
  filter,
  onFilterChange,
  onDragEnd,
  onAddTask,
  onMoveCompletedToBottom,
  onEditTask,
  onDeleteTask,
  onArchiveTask,
  onUnarchiveTask,
  onToggleComplete,
}: TaskListProps) {
  const getFilteredTasks = () => {
    switch (filter) {
      case "active":
        return tasks.filter((task) => !task.completed && !task.archived);
      case "completed":
        return tasks.filter((task) => task.completed);
      case "archived":
        return tasks.filter((task) => task.archived);
      default:
        return tasks;
    }
  };

  const filteredTasks = getFilteredTasks();
  const activeCount = tasks.filter((t) => !t.completed && !t.archived).length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const archivedCount = tasks.filter((t) => t.archived).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
        <h3 className="text-lg sm:text-xl font-semibold">Tasks</h3>
        <Button
          onClick={onAddTask}
          className="rounded-full text-xs sm:text-sm"
          size="sm"
        >
          <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
          Add Task
        </Button>
      </div>

      {/* Task Filters */}
      <div className="flex flex-col gap-2 mb-3 sm:mb-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("all")}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">All Tasks ({tasks.length})</span>
            <span className="sm:hidden">All ({tasks.length})</span>
          </Button>
          <Button
            variant={filter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("active")}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Active ({activeCount})</span>
            <span className="sm:hidden">Active ({activeCount})</span>
          </Button>
          <Button
            variant={filter === "completed" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("completed")}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Completed ({completedCount})</span>
            <span className="sm:hidden">Done ({completedCount})</span>
          </Button>
          <Button
            variant={filter === "archived" ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange("archived")}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Archived ({archivedCount})</span>
            <span className="sm:hidden">Arc ({archivedCount})</span>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          {filter !== "all" && (
            <p className="text-xs text-muted-foreground">
              Task reordering is only available when viewing all tasks
            </p>
          )}
          {filter === "all" &&
            tasks.some((t) => t.completed || t.archived) && (
              <Button
                variant="outline"
                size="sm"
                onClick={onMoveCompletedToBottom}
                className="ml-auto text-xs sm:text-sm"
              >
                <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">
                  Move Completed/Archived to Bottom
                </span>
                <span className="sm:hidden">Move Done to Bottom</span>
              </Button>
            )}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="tasks">
          {(provided: DroppableProvided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-3"
            >
              {filteredTasks.map((task, index) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  index={index}
                  isDragDisabled={filter !== "all"}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                  onArchive={onArchiveTask}
                  onUnarchive={onUnarchiveTask}
                  onToggleComplete={onToggleComplete}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {filteredTasks.length === 0 && (
        <div className="text-center text-muted-foreground py-6 sm:py-8">
          <Target className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
          <div className="text-sm sm:text-base">
            {filter === "all"
              ? "No tasks yet. Add some tasks to get started!"
              : filter === "active"
              ? "No active tasks found."
              : filter === "completed"
              ? "No completed tasks found."
              : "No archived tasks found."}
          </div>
          {filter === "all" && (
            <Button
              variant="outline"
              className="mt-3 sm:mt-4 text-sm sm:text-base"
              onClick={onAddTask}
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Add your first task
            </Button>
          )}
        </div>
      )}
    </div>
  );
});
