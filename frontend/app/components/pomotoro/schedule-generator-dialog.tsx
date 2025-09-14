import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Calendar, Clock, Zap, Users } from "lucide-react";
import { useTaskStore, type Session } from "~/stores/tasks";
import { useSchedulerStore } from "~/stores/scheduler";

interface ScheduleGeneratorDialogProps {
  onScheduleGenerated?: () => void;
}

export function ScheduleGeneratorDialog({
  onScheduleGenerated,
}: ScheduleGeneratorDialogProps) {
  const { sessions, loadSessions } = useTaskStore();
  const { generateSchedule, isLoading, fitnessScore } = useSchedulerStore();
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Sessions that have at least one uncompleted & non-archived task
  const availableSessions = sessions.filter(
    (session) =>
      !session.completed &&
      session.tasks &&
      session.tasks.some((task) => !task.completed && !task.archived)
  );

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  const handleSessionToggle = (sessionId: number) => {
    setSelectedSessions((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const handleGenerateSchedule = async () => {
    if (selectedSessions.length === 0) return;

    await generateSchedule(selectedSessions);
    setIsOpen(false);
    setSelectedSessions([]);
    onScheduleGenerated?.();
  };

  const getTotalTasks = (sessions: Session[]) => {
    return sessions.reduce(
      (total, session) =>
        total +
        (session.tasks?.filter((task) => !task.completed && !task.archived)
          .length || 0),
      0
    );
  };

  const getTotalTime = (sessions: Session[]) => {
    return sessions.reduce(
      (total, session) =>
        total +
        (session.tasks
          ?.filter((task) => !task.completed && !task.archived)
          .reduce(
            (sessionTotal, task) =>
              sessionTotal + task.estimated_completion_time,
            0
          ) || 0),
      0
    );
  };

  const selectedSessionObjects = availableSessions.filter((session) =>
    selectedSessions.includes(session.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="text-xs sm:text-sm px-2 sm:px-3 flex-1 sm:flex-none"
        >
          <Zap className="size-3 sm:size-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Generate</span>
          <span className="sm:hidden">Generate</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto mx-4 sm:mx-0 w-[95vw] sm:w-full p-4 sm:p-6">
        <DialogHeader className="space-y-2 sm:space-y-3">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Calendar className="size-4 sm:size-5" />
            Generate Schedule
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Select sessions to generate an optimized task schedule using genetic
            algorithm. Only uncompleted tasks will be included in the schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Available Sessions</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No available sessions with uncompleted tasks. Create sessions
                  with tasks or ensure your sessions have uncompleted tasks.
                </p>
              ) : (
                availableSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleSessionToggle(session.id)}
                  >
                    <Checkbox
                      checked={selectedSessions.includes(session.id)}
                      onCheckedChange={() => handleSessionToggle(session.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                        <span className="font-medium text-sm sm:text-base truncate">
                          {session.name || session.description}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-xs w-fit sm:min-w-[120px] h-6 flex items-center justify-center shrink-0 px-2"
                        >
                          {session.tasks?.filter(
                            (task) => !task.completed && !task.archived
                          ).length || 0}{" "}
                          <span className="hidden sm:inline ml-1">uncompleted tasks</span> 
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {session.tasks
                            ?.filter(
                              (task) => !task.completed && !task.archived
                            )
                            .reduce(
                              (total, task) =>
                                total + task.estimated_completion_time,
                              0
                            ) || 0}{" "}
                          min
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedSessions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">Schedule Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Sessions:</span>
                    <div className="font-medium">{selectedSessions.length}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Tasks:</span>
                    <div className="font-medium">
                      {getTotalTasks(selectedSessionObjects)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Time:</span>
                    <div className="font-medium">
                      {getTotalTime(selectedSessionObjects)} min
                    </div>
                  </div>
                </div>
                {fitnessScore > 0 && (
                  <div className="flex items-center gap-2 pt-3 border-t mt-3">
                    <Zap className="size-4 text-yellow-500" />
                    <span className="text-sm">
                      Last Optimization Score:{" "}
                      <span className="font-medium">
                        {fitnessScore.toFixed(2)}
                      </span>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full sm:w-auto text-sm sm:text-base py-2 sm:py-3">
            Cancel
          </Button>
          <Button
            onClick={handleGenerateSchedule}
            disabled={selectedSessions.length === 0 || isLoading}
            className="w-full sm:w-auto text-sm sm:text-base py-2 sm:py-3"
          >
            {isLoading ? (
              <>
                <span className="hidden sm:inline">Generating...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Zap className="size-3 sm:size-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Generate ({selectedSessions.length})</span>
                <span className="sm:hidden">Gen ({selectedSessions.length})</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
