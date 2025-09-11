import { usePomodoroStore } from "~/stores/pomodoro";

/**
 * Component to display current time tracking information
 * Shows total focus time and current task time for debugging/verification
 */
export function TimeTrackingDisplay() {
  const { 
    totalFocusTime, 
    currentTaskTime, 
    taskStartTime, 
    currentTaskId,
    phase,
    getTaskCompletionTime 
  } = usePomodoroStore();

  // Convert seconds to minutes for display
  const totalFocusMinutes = Math.floor(totalFocusTime / 60);
  const currentTaskMinutes = Math.floor(currentTaskTime / 60);
  const currentSessionMinutes = taskStartTime && phase === "focus" 
    ? Math.floor((Date.now() - taskStartTime) / (1000 * 60))
    : 0;

  if (!currentTaskId) {
    return (
      <div className="text-xs text-muted-foreground p-2 border rounded">
        <p>No active task</p>
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground p-2 border rounded space-y-1">
      <div className="font-medium">Time Tracking</div>
      <div>Total Focus Time: {totalFocusMinutes}m</div>
      <div>Current Task Time: {currentTaskMinutes}m</div>
      {currentSessionMinutes > 0 && (
        <div>Current Session: {currentSessionMinutes}m</div>
      )}
      <div>Task Completion Time: {getTaskCompletionTime()}m</div>
      <div className="text-xs opacity-60">
        Task ID: {currentTaskId} | Phase: {phase}
      </div>
    </div>
  );
}