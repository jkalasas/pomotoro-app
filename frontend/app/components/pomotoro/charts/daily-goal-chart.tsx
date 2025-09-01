import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";

import { TextRoller } from "~/components/pomotoro/animations/text-roller";
import { type ChartConfig, ChartContainer } from "~/components/ui/chart";
import { cn } from "~/lib/utils";

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

type TProps = {
  sessions: number;
  targetSessions: number;
};

export function DailyGoalChart({ sessions, targetSessions }: TProps) {
  return (
    <div className="relative">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[256px]"
      >
        <RadialBarChart
          data={chartData}
          startAngle={0}
          endAngle={(sessions / targetSessions) * 360}
          innerRadius={80}
          outerRadius={110}
        >
          <PolarGrid
            gridType="circle"
            radialLines={false}
            stroke="none"
            className="first:fill-muted last:fill-background"
            polarRadius={[86, 74]}
          />
          <RadialBar dataKey="visitors" background cornerRadius={10} />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} />
        </RadialBarChart>
      </ChartContainer>

      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center"
        )}
      >
        <span>Daily Goal</span>
        <span className="font-bold text-2xl">{sessions}</span>
        <span>Session</span>
      </div>
    </div>
  );
}
