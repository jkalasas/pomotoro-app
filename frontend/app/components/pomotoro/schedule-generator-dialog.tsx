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

export function ScheduleGeneratorDialog({ onScheduleGenerated }: ScheduleGeneratorDialogProps) {
  const { sessions, loadSessions } = useTaskStore();
  const { generateSchedule, isLoading, fitnessScore } = useSchedulerStore();
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Sessions that have at least one uncompleted & non-archived task
  const availableSessions = sessions.filter(session => 
    !session.completed &&
    session.tasks &&
    session.tasks.some(task => !task.completed && !task.archived)
  );

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  const handleSessionToggle = (sessionId: number) => {
    setSelectedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
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
    return sessions.reduce((total, session) => 
      total + (session.tasks?.filter(task => !task.completed && !task.archived).length || 0)
    , 0);
  };

  const getTotalTime = (sessions: Session[]) => {
    return sessions.reduce((total, session) => 
      total + (
        session.tasks?.filter(task => !task.completed && !task.archived)
          .reduce((sessionTotal, task) => sessionTotal + task.estimated_completion_time, 0) || 0
      ), 0);
  };

  const selectedSessionObjects = availableSessions.filter(session => 
    selectedSessions.includes(session.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Zap className="size-4 mr-2" />
          Generate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="size-5" />
            Generate Schedule
          </DialogTitle>
          <DialogDescription>
            Select sessions to generate an optimized task schedule using genetic algorithm. Only uncompleted tasks will be included in the schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Available Sessions</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No available sessions with uncompleted tasks. Create sessions with tasks or ensure your sessions have uncompleted tasks.
                </p>
              ) : (
                availableSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedSessions.includes(session.id)}
                      onCheckedChange={() => handleSessionToggle(session.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {session.name || session.description}
                        </span>
                        <Badge variant="secondary" className="text-xs min-w-[120px] h-6 flex items-center justify-center shrink-0 px-2">
                          {session.tasks?.filter(task => !task.completed && !task.archived).length || 0} uncompleted tasks
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {session.tasks?.filter(task => !task.completed && !task.archived)
                            .reduce((total, task) => total + task.estimated_completion_time, 0) || 0} min
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
                <CardTitle className="text-sm">Schedule Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Sessions:</span>
                    <div className="font-medium">{selectedSessions.length}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Tasks:</span>
                    <div className="font-medium">{getTotalTasks(selectedSessionObjects)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Time:</span>
                    <div className="font-medium">{getTotalTime(selectedSessionObjects)} min</div>
                  </div>
                </div>
                {fitnessScore > 0 && (
                  <div className="flex items-center gap-2 pt-3 border-t mt-3">
                    <Zap className="size-4 text-yellow-500" />
                    <span className="text-sm">
                      Last Optimization Score: <span className="font-medium">{fitnessScore.toFixed(2)}</span>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerateSchedule}
            disabled={selectedSessions.length === 0 || isLoading}
          >
            {isLoading ? (
              "Generating..."
            ) : (
              <>
                <Zap className="size-4 mr-2" />
                Generate ({selectedSessions.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
