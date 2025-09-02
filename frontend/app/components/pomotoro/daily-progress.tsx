import { useEffect } from "react";
import { useDailyProgressStore } from "~/stores/daily-progress";
import { useAuthStore } from "~/stores/auth";
import { Button } from "~/components/ui/button";
import { FilePenLine } from "lucide-react";

export function DailyProgress() {
  const { progress, isLoading, error, loadDailyProgress } = useDailyProgressStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      loadDailyProgress();
    }
  }, [user]);

  // Listen for task completion events to refresh progress
  useEffect(() => {
    const handleTaskCompleted = () => {
      if (user) {
        loadDailyProgress();
      }
    };

    window.addEventListener('task-completed', handleTaskCompleted);
    return () => {
      window.removeEventListener('task-completed', handleTaskCompleted);
    };
  }, [loadDailyProgress, user]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="font-bold">Daily Progress</span>
          <Button variant="ghost">
            <FilePenLine className="size-6" />
          </Button>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Default values for when there's no data or error
  const displayData = progress || {
    rest_time_minutes: 0,
    daily_goal_sessions: 8,
    completed_tasks: 0,
    completed_sessions: 0,
    date: new Date().toISOString().split('T')[0]
  };

  const progressPercentage = Math.min((displayData.completed_sessions / displayData.daily_goal_sessions) * 100, 100);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="font-bold">Daily Progress</span>
        <Button variant="ghost" onClick={() => user && loadDailyProgress()}>
          <FilePenLine className="size-6" />
        </Button>
      </div>
      <div className="flex justify-between items-center px-5 flex-col lg:flex-row gap-3">
        {/* Rest Time */}
        <div className="flex flex-col items-center justify-center">
          <span>Rests</span>
          <span className="text-2xl font-bold">{displayData.rest_time_minutes}</span>
          <span>Minutes</span>
        </div>
        
        {/* Daily Goal Chart */}
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted"
              opacity="0.2"
            />
            {/* Progress circle */}
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progressPercentage / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground">Daily Goal</span>
            <span className="text-2xl font-bold">{displayData.daily_goal_sessions}</span>
            <span className="text-sm text-muted-foreground">Sessions</span>
          </div>
        </div>

        {/* Finished Tasks */}
        <div className="flex flex-col items-center justify-center">
          <span>Finished</span>
          <span className="text-2xl font-bold">{displayData.completed_tasks}</span>
          <span>Tasks</span>
        </div>
      </div>

      {/* Completed Sessions Info */}
      <p className="text-center">
        Completed: {displayData.completed_sessions} session{displayData.completed_sessions !== 1 ? 's' : ''}
      </p>

      {/* Error state */}
      {error && !user && (
        <p className="text-center text-sm text-muted-foreground">
          Please log in to view progress data
        </p>
      )}
      {error && user && (
        <p className="text-center text-sm text-muted-foreground">
          Unable to load progress data
        </p>
      )}
    </div>
  );
}
