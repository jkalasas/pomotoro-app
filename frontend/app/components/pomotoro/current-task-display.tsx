import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Clock, Users, Target, CheckCircle2 } from "lucide-react";
import { useSchedulerStore } from "~/stores/scheduler";
import { useTaskStore } from "~/stores/tasks";

export function CurrentTaskDisplay() {
  const { getCurrentTask, getNextTask, currentSchedule } = useSchedulerStore();
  const { sessions } = useTaskStore();
  
  const currentTask = getCurrentTask();
  const nextTask = getNextTask();
  
  if (!currentSchedule || currentSchedule.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-6">
          <Target className="size-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">
            No active schedule. Generate one to start working on tasks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getSessionName = (sessionId: number) => {
    const session = sessions.find(s => s.id === sessionId);
    return session?.name || session?.description || `Session ${sessionId}`;
  };

  const completedTasks = currentSchedule.filter(task => task.completed).length;
  const totalTasks = currentSchedule.length;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-4">
          {/* Progress Overview */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              <span className="text-sm font-medium">
                Progress: {completedTasks}/{totalTasks} tasks
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}% complete
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300" 
              style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
            />
          </div>

          {/* Current Task */}
          {currentTask ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-primary">Current Task</h3>
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="font-medium">{currentTask.name}</div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {currentTask.estimated_completion_time} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {getSessionName(currentTask.session_id)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="size-8 mx-auto mb-2 text-green-500" />
              <p className="text-green-600 font-medium">All tasks completed!</p>
              <p className="text-sm text-muted-foreground">
                Great job finishing your schedule.
              </p>
            </div>
          )}

          {/* Next Task Preview */}
          {nextTask && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Up Next</h3>
              <div className="p-2 bg-muted/50 rounded border-l-2 border-muted-foreground/20">
                <div className="text-sm">{nextTask.name}</div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {nextTask.estimated_completion_time} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {getSessionName(nextTask.session_id)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
