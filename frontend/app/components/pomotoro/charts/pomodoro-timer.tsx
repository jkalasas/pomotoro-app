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
  time: number;
  endTime: number;
};

export function PomodoroTimer({ time, endTime }: TProps) {
  const hours = Math.floor(time / 3600);
  const minutes = String(Math.floor((time % 3600) / 60)).padStart(2, "0");
  const seconds = String(time % 60).padStart(2, "0");
  const showHours = hours > 0;

  return (
    <div className="relative">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[256px]"
      >
        <RadialBarChart
          data={chartData}
          startAngle={0}
          endAngle={(time / endTime) * 360}
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

      {/* Timer with rolling animation positioned over the chart */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center font-bold",
          showHours ? "text-2xl" : "text-4xl"
        )}
      >
        <div className="flex items-center">
          {showHours && (
            <>
              <TextRoller
                className="w-4 h-6"
                text={String(hours).padStart(2, "0")[0]}
              />
              <TextRoller
                className="w-4 h-6"
                text={String(hours).padStart(2, "0")[1]}
              />
              <span className="mx-0.5">:</span>
            </>
          )}
          <TextRoller
            className={cn(showHours && "w-4 h-6")}
            text={minutes[0]}
          />
          <TextRoller
            className={cn(showHours && "w-4 h-6")}
            text={minutes[1]}
          />
          <span className="mx-0.5">:</span>
          <TextRoller
            className={cn(showHours && "w-4 h-6")}
            text={seconds[0]}
          />
          <TextRoller
            className={cn(showHours && "w-4 h-6")}
            text={seconds[1]}
          />
        </div>
      </div>
    </div>
  );
}
