import { memo } from "react";
import {
  Card,
  CardContent,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  Target,
  Copy,
} from "lucide-react";
import type { Session, Task } from "~/stores/tasks";
import { TaskList } from "./TaskList";
import { type DropResult } from "@hello-pangea/dnd";

interface SessionDetailProps {
  session: Session | null;
  taskFilter: "all" | "active" | "completed" | "archived";
  onTaskFilterChange: (filter: "all" | "active" | "completed" | "archived") => void;
  onEditSession: (session: Session) => void;
  onDuplicateSession: (session: Session) => void;
  onDeleteSession: (sessionId: number) => void;
  onArchiveSession: (sessionId: number) => void;
  onUnarchiveSession: (sessionId: number) => void;
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: number) => void;
  onArchiveTask: (taskId: number) => void;
  onUnarchiveTask: (taskId: number) => void;
  onToggleTaskComplete: (task: Task) => void;
  onTaskDragEnd: (result: DropResult) => void;
  onMoveCompletedTasksToBottom: () => void;
}

export const SessionDetail = memo(function SessionDetail({
  session,
  taskFilter,
  onTaskFilterChange,
  onEditSession,
  onDuplicateSession,
  onDeleteSession,
  onArchiveSession,
  onUnarchiveSession,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onArchiveTask,
  onUnarchiveTask,
  onToggleTaskComplete,
  onTaskDragEnd,
  onMoveCompletedTasksToBottom,
}: SessionDetailProps) {
  if (!session) {
    return (
      <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl h-full">
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center justify-center h-48 sm:h-64">
            <div className="text-center text-muted-foreground">
              <Target className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <div className="text-sm sm:text-base">
                Select a session to view details
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="backdrop-blur-sm bg-card/80 border-border/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl h-full">
      <CardContent className="p-3 sm:p-6">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">{session.name}</h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {session.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs sm:text-sm"
                    onClick={() => onEditSession(session)}
                  >
                    <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Edit
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Session</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs sm:text-sm"
                    onClick={() => onDuplicateSession(session)}
                  >
                    <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Duplicate</span>
                    <span className="sm:hidden">Copy</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Duplicate Session</TooltipContent>
              </Tooltip>

              {!session.archived ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs sm:text-sm"
                      onClick={() => onArchiveSession(session.id)}
                    >
                      <Archive className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Archive</span>
                      <span className="sm:hidden">Archive</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Archive Session</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs sm:text-sm"
                      onClick={() => onUnarchiveSession(session.id)}
                    >
                      <ArchiveRestore className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Unarchive</span>
                      <span className="sm:hidden">Restore</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Unarchive Session</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-full text-xs sm:text-sm"
                    onClick={() => onDeleteSession(session.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1 " />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Session</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Session Config */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-3 sm:p-4">
                <div className="text-lg sm:text-2xl font-bold">
                  {session.focus_duration}m
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Focus Duration
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-3 sm:p-4">
                <div className="text-lg sm:text-2xl font-bold">
                  {session.short_break_duration}m
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Short Break
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-3 sm:p-4">
                <div className="text-lg sm:text-2xl font-bold">
                  {session.long_break_duration}m
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Long Break
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-3 sm:p-4">
                <div className="text-lg sm:text-2xl font-bold">
                  {session.long_break_per_pomodoros}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  <span className="hidden sm:inline">Cycles for Long Break</span>
                  <span className="sm:hidden">Long Break Cycles</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <TaskList
            tasks={session.tasks}
            filter={taskFilter}
            onFilterChange={onTaskFilterChange}
            onDragEnd={onTaskDragEnd}
            onAddTask={onAddTask}
            onMoveCompletedToBottom={onMoveCompletedTasksToBottom}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onArchiveTask={onArchiveTask}
            onUnarchiveTask={onUnarchiveTask}
            onToggleComplete={onToggleTaskComplete}
          />
        </div>
      </CardContent>
    </Card>
  );
});
