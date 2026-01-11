import { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import {
  Card,
  CardContent,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  GripVertical,
  Target,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  Undo2,
  Check,
} from "lucide-react";
import type { Task } from "~/stores/tasks";

interface TaskItemProps {
  task: Task;
  index: number;
  isDragDisabled: boolean;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onArchive: (taskId: number) => void;
  onUnarchive: (taskId: number) => void;
  onToggleComplete: (task: Task) => void;
}

export const TaskItem = memo(function TaskItem({
  task,
  index,
  isDragDisabled,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onToggleComplete,
}: TaskItemProps) {
  return (
    <Draggable
      draggableId={task.id.toString()}
      index={index}
      isDragDisabled={isDragDisabled}
    >
      {(provided, snapshot) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`bg-card/60 backdrop-blur-sm ${
            snapshot.isDragging ? "shadow-lg" : "shadow-sm"
          } hover:shadow-md transition-all ${
            task.completed
              ? " border-green-800"
              : task.archived
              ? " border-gray-800"
              : ""
          }`}
        >
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start sm:items-center gap-2 sm:gap-3">
              <div {...provided.dragHandleProps} className="mt-1 sm:mt-0">
                <GripVertical
                  className={`h-4 w-4 sm:h-5 sm:w-5 ${
                    !isDragDisabled
                      ? "text-muted-foreground cursor-grab"
                      : "text-muted-foreground/30 cursor-not-allowed"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm sm:text-base truncate">
                    {task.name}
                  </h4>
                </div>
                <div className="flex items-start gap-1 sm:gap-2 flex-wrap mb-1 sm:mb-2">
                  <Badge variant="secondary" className="text-xs">
                    {task.category}
                  </Badge>
                  {task.completed && (
                    <Badge variant="default" className="text-xs">
                      Completed
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Target className="h-3 w-3" />
                  <span>{task.estimated_completion_time}min</span>
                  {task.due_date && (
                    <span className="ml-2">
                      • Due: {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {task.actual_completion_time && (
                    <span className="hidden sm:inline">
                      • Actual: {task.actual_completion_time} minutes
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-1 sm:gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleComplete(task)}
                      aria-label={
                        task.completed ? "Uncomplete task" : "Complete task"
                      }
                      title={task.completed ? "Uncomplete" : "Complete"}
                      disabled={task.archived && !task.completed}
                      className="h-8 w-8 sm:h-auto sm:w-auto p-1 sm:p-2"
                    >
                      {task.completed ? (
                        <Undo2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      ) : (
                        <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {task.completed ? "Mark as Incomplete" : "Mark as Complete"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(task)}
                      className="h-8 w-8 sm:h-auto sm:w-auto p-1 sm:p-2"
                    >
                      <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit Task</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(task.id)}
                      className="h-8 w-8 sm:h-auto sm:w-auto p-1 sm:p-2"
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Task</TooltipContent>
                </Tooltip>

                {!task.archived ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onArchive(task.id)}
                        className="h-8 w-8 sm:h-auto sm:w-auto p-1 sm:p-2"
                      >
                        <Archive className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Archive Task</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onUnarchive(task.id)}
                        className="h-8 w-8 sm:h-auto sm:w-auto p-1 sm:p-2"
                      >
                        <ArchiveRestore className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Unarchive Task</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </Draggable>
  );
});
