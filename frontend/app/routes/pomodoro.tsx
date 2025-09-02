import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { Bug, Pause, Play, RefreshCw } from "lucide-react";

import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";

import { type ChartConfig, ChartContainer } from "~/components/ui/chart";
import { TextRoller } from "~/components/pomotoro/animations/text-roller";
import { cn } from "~/lib/utils";
import { PomodoroTimer } from "~/components/pomotoro/charts/pomodoro-timer";
import { usePomodoroStore } from "~/stores/pomodoro";
import { useEffect, useRef } from "react";
import { useWindowStore } from "~/stores/window";
import { apiClient } from "~/lib/api";
import { SessionSelector } from "~/components/pomotoro/session-selector";

const chartData = [
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
];

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  safari: {
    label: "Safari",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pomodoro" },
    { name: "description", content: "Pomdoro Timer" },
  ];
}

export default function Pomodoro() {
  const {
    time,
    maxTime,
    isRunning,
    phase,
    currentTaskId,
    startTimer,
    pauseTimer,
    resetTimer,
    loadActiveSession,
    isLoading,
    setTime,
  } = usePomodoroStore();

  const window = useWindowStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    window.setSize({ width: window.size.width, height: 360 });
  }, []);

  useEffect(() => {
    loadActiveSession();
  }, [loadActiveSession]);

  // Timer countdown effect
  useEffect(() => {
    if (isRunning && time > 0) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setTime(time - 1);
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, time, setTime]);

  // Sync with backend periodically and handle timer completion
  useEffect(() => {
    if (time > 0 && time % 10 === 0 && isRunning) {
      // Sync time with backend every 10 seconds
      apiClient.updateActiveSession({ time_remaining: time }).catch(console.error);
    }

    if (time === 0 && isRunning) {
      // Timer completed
      apiClient.updateActiveSession({ is_running: false }).catch(console.error);
      // TODO: Handle phase transitions (focus -> break -> focus)
      toast.success("Pomodoro completed!");
    }
  }, [time, isRunning]);

  return (
    <main className="container mx-auto">
      <div className="flex justify-center mb-4">
        <SessionSelector />
      </div>

      <PomodoroTimer time={time} endTime={maxTime} />

      <div className="text-center mb-4">
        <p className="text-lg font-medium">Phase: {phase}</p>
        {currentTaskId && (
          <p className="text-sm text-muted-foreground">
            Task ID: {currentTaskId}
          </p>
        )}
      </div>

      <div className="flex justify-center gap-2 mb-4">
        {!isRunning ? (
          <Button type="button" onClick={startTimer} disabled={isLoading}>
            <Play className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={pauseTimer} disabled={isLoading}>
            <Pause className="size-4" />
          </Button>
        )}
        <Button type="button" onClick={resetTimer} disabled={isLoading}>
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          onClick={() => {
            // For testing - set time to 10 seconds
            // This would need to be updated to use the API
          }}
          disabled={isLoading}
        >
          <Bug className="size-4" />
        </Button>
      </div>
    </main>
  );
}
