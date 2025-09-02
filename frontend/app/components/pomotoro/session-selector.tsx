import { useEffect } from "react";
import { useTaskStore } from "~/stores/tasks";
import { usePomodoroStore } from "~/stores/pomodoro";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Loader2 } from "lucide-react";

export function SessionSelector() {
  const { sessions, isLoading, loadSessions } = useTaskStore();
  const { sessionId, setSession, isLoading: pomodoroLoading } = usePomodoroStore();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSessionChange = async (sessionIdStr: string) => {
    const id = parseInt(sessionIdStr);
    if (!isNaN(id)) {
      await setSession(id);
    }
  };

  const currentSession = sessions.find(s => s.id === sessionId);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Session:</label>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Select
          value={sessionId?.toString() || ""}
          onValueChange={handleSessionChange}
          disabled={pomodoroLoading}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select a session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id.toString()}>
                {session.name || `Session ${session.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {currentSession && (
        <div className="text-xs text-muted-foreground">
          {currentSession.description}
        </div>
      )}
    </div>
  );
}
