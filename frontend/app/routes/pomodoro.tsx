import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";
import { useTimer } from "~/hooks/use-timer";
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
import { useEffect } from "react";
import { useWindowStore } from "~/stores/window";

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
    startTimer,
    pauseTimer,
    resetTimer,
    setOnTimesUp,
    setTime,
    setMaxTime,
  } = usePomodoroStore();

  const window = useWindowStore();

  useEffect(() => {
    window.setSize({ width: window.size.width, height: 360 });
  }, []);

  return (
    <main className="container mx-auto">
      <PomodoroTimer time={time} endTime={maxTime} />

      <div className="flex justify-center gap-2 mb-4">
        {!isRunning ? (
          <Button type="button" onClick={startTimer}>
            <Play className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={pauseTimer}>
            <Pause className="size-4" />
          </Button>
        )}
        <Button type="button" onClick={resetTimer}>
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          onClick={() => {
            setMaxTime(10);
            resetTimer();
          }}
        >
          <Bug className="size-4" />
        </Button>
      </div>
    </main>
  );
}
