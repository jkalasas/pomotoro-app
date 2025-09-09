import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Check,
  RotateCcw,
  Clock,
  GripVertical,
  Trash2,
  Calendar,
  Settings,
} from "lucide-react";
import { useSchedulerStore } from "~/stores/scheduler";
import { useTaskStore } from "~/stores/tasks";
import { usePomodoroStore } from "~/stores/pomodoro";
import type { ScheduledTask } from "~/types/scheduler";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

interface ScheduledTasksListProps {
  sessionSettings: {
    focus_duration: number;
    short_break_duration: number;
    long_break_duration: number;
    long_break_per_pomodoros: number;
  };
  onOpenSettings: () => void;
}

export function ScheduledTasksList({
  sessionSettings,
  onOpenSettings,
}: ScheduledTasksListProps) {
  const {
    currentSchedule,
    totalScheduleTime,
    fitnessScore,
    reorderScheduleWithTimerReset,
    completeScheduledTask,
    uncompleteScheduledTask,
    clearSchedule,
  } = useSchedulerStore();

  const { sessions } = useTaskStore();
  const { isRunning } = usePomodoroStore();

  const visible = (currentSchedule || []).filter(t => !t.archived);

  if (!visible || visible.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <div className="text-center space-y-2">
          <Calendar className="size-8 mx-auto opacity-50" />
          <p className="text-sm">No schedule generated</p>
          <p className="text-xs">Click "Generate Schedule" to get started</p>
        </div>
      </div>
    );
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) {
      return;
    }

    // Ensure we use the unarchived list for visible ordering, but reorder the underlying schedule accordingly
    if (!currentSchedule) return;
    const newSchedule = Array.from(currentSchedule);
    const [movedTask] = newSchedule.splice(sourceIndex, 1);
    newSchedule.splice(destinationIndex, 0, movedTask);

    // Use the new method that handles timer reset
    reorderScheduleWithTimerReset(newSchedule, isRunning);
  };

  const completedTasks = visible.filter(
    (task) => task.completed
  ).length;
  const totalTasks = visible.length;
  const completedTime = visible
    .filter((task) => task.completed)
    .reduce((total, task) => total + task.estimated_completion_time, 0);

  return (
    <>
      {/* Schedule Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
        <div className="space-y-1">
          <span className="text-muted-foreground">Progress</span>
          <div className="font-medium">
            {completedTasks}/{totalTasks} tasks
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Time Left</span>
          <div className="font-medium">
            {totalScheduleTime - completedTime} min
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground">Total Time</span>
          <div className="font-medium">{totalScheduleTime} min</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-2 mb-4">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
        />
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="scheduled-tasks">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-1"
            >
              {visible.map((task, index) => (
                <Draggable
                  key={task.id.toString()}
                  draggableId={task.id.toString()}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`group p-3 border rounded-lg transition-all duration-200 ${
                        task.completed
                          ? "bg-muted border-border/50 opacity-75"
                          : "bg-card border-border hover:border-primary/50 hover:shadow-sm"
                      } ${
                        snapshot.isDragging
                          ? "opacity-50 scale-95 shadow-lg"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Drag Handle */}
                        <div
                          {...provided.dragHandleProps}
                          className="flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity cursor-grab"
                        >
                          <GripVertical className="size-4" />
                        </div>

                        {/* Task Order Number */}
                        <div className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary text-xs font-medium rounded-full flex items-center justify-center">
                          {index + 1}
                        </div>

                        {/* Task Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`font-medium ${
                                task.completed
                                  ? "line-through text-muted-foreground"
                                  : ""
                              }`}
                            >
                              {task.name?.trim() || "Untitled Task"}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {task.estimated_completion_time} min
                            </span>
                            {task.due_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="size-3" />
                                Due:{" "}
                                {new Date(task.due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {/* Session Badge */}
                          {(() => {
                            const session = sessions.find(
                              (s) => s.id === task.session_id
                            );
                            return session ? (
                              <Badge
                                variant="default"
                                className="text-white text-xs px-2 py-0.5 shrink-0 font-normal"
                              >
                                {session.name}
                              </Badge>
                            ) : null;
                          })()}
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0">
                          <Button
                            size="sm"
                            variant={task.completed ? "outline" : "default"}
                            onClick={() => {
                              if (task.completed) {
                                uncompleteScheduledTask(task.id);
                              } else {
                                completeScheduledTask(task.id);
                              }
                            }}
                          >
                            {task.completed ? (
                              <span className="flex items-center gap-1">
                                <RotateCcw className="size-4" />
                                Undo
                              </span>
                            ) : (
                              <Check className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

  {visible.length > 0 && (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <strong>Tip:</strong> Drag and drop tasks to reorder them manually.
          The AI has optimized this schedule for urgency, momentum, and variety.
        </div>
      )}
    </>
  );
}
