import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Badge } from "~/components/ui/badge";
import {
  Clock,
  CheckCircle,
  Timer,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
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

  // Calculate streaks and trends
  const currentStreak = calculateCurrentStreak(stats);
  const trend = calculateTrend(stats);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Focus Time
          </CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalFocusHours.toFixed(1)}h
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
          <Flame className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{currentStreak}</div>
          <div className="flex items-center space-x-2 mt-2">
            <Badge
              variant={
                trend === "On fire!"
                  ? "default"
                  : trend === "Room to grow"
                  ? "destructive"
                  : "secondary"
              }
            >
              {trend === "On fire!" ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : trend === "Room to grow" ? (
                <TrendingDown className="h-3 w-3 mr-1" />
              ) : (
                <Minus className="h-3 w-3 mr-1" />
              )}{" "}
              {trend}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function calculateCurrentStreak(stats: DailyStats[]): number {
  if (stats.length === 0) return 0;

  // Sort by date descending
  const sortedStats = [...stats].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let streak = 0;
  for (const stat of sortedStats) {
    if (stat.sessions_completed > 0) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function calculateTrend(
  stats: DailyStats[]
): "On fire!" | "Room to grow" | "Steady Pace" {
  if (stats.length < 7) return "Steady Pace";

  const sortedStats = [...stats].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const firstHalf = sortedStats.slice(0, Math.floor(sortedStats.length / 2));
  const secondHalf = sortedStats.slice(Math.floor(sortedStats.length / 2));

  const firstHalfAvg =
    firstHalf.reduce((sum, stat) => sum + stat.total_focus_time, 0) /
    firstHalf.length;
  const secondHalfAvg =
    secondHalf.reduce((sum, stat) => sum + stat.total_focus_time, 0) /
    secondHalf.length;

  const difference = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

  if (difference > 0.1) return "On fire!";
  if (difference < -0.1) return "Room to grow";
  return "Steady Pace";
}
