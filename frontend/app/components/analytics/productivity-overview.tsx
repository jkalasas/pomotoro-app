import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Clock, CheckCircle, Timer } from "lucide-react";
import type { DailyStats } from "~/lib/analytics";

interface ProductivityOverviewProps {
  stats: DailyStats[];
}

export function ProductivityOverview({ stats }: ProductivityOverviewProps) {
  // Calculate aggregate metrics
  const totalFocusHours =
    stats.reduce((sum, stat) => sum + stat.total_focus_time, 0) / 3600;
  const totalTasksCompleted = stats.reduce(
    (sum, stat) => sum + stat.tasks_completed,
    0
  );
  const totalSessions = stats.reduce(
    (sum, stat) => sum + stat.sessions_completed,
    0
  );
  const totalPomodoros = stats.reduce(
    (sum, stat) => sum + stat.pomodoros_completed,
    0
  );

  // Streak card removed

  const displayHours = Math.floor(totalFocusHours);
  const displayMinutes = Math.round((totalFocusHours - displayHours) * 60);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Focus Time
          </CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {displayHours > 0
              ? `${displayHours}h ${displayMinutes}m`
              : `${displayMinutes}m`}
          </div>
          <p className="text-xs text-muted-foreground">
            Across {stats.length} days
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTasksCompleted}</div>
          <p className="text-xs text-muted-foreground">
            {totalSessions} sessions completed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Pomodoros Completed
          </CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalPomodoros}</div>
          <p className="text-xs text-muted-foreground">
            Focus sessions completed
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
