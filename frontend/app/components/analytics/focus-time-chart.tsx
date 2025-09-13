import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import type { ChartDataPoint } from '~/lib/analytics';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "~/components/ui/chart";

interface FocusTimeChartProps {
  data: ChartDataPoint[];
}

export function FocusTimeChart({ data }: FocusTimeChartProps) {
  const chartConfig: ChartConfig = {
    focus_time: {
      label: "Focus Time",
      color: "#8884d8",
    },
    break_time: {
      label: "Break Time",
      color: "#82ca9d",
    },
    date: {
      label: "Date",
    },
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus Time Trend</CardTitle>
        <CardDescription>
          Your daily focus and break time over the past weeks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) => {
                    try {
                      return new Date(String(value)).toLocaleDateString();
                    } catch {
                      return String(value);
                    }
                  }}
                  formatter={(value, name) => {
                    const hours = Math.floor(value as number);
                    const minutes = Math.round((value as number - hours) * 60);
                    return (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-muted-foreground">{name}:</span>
                        <span className="text-foreground font-mono">{hours ? `${hours} hours` : ''}{minutes ? ` ${minutes} minutes` : ' 0 minutes'}</span>
                      </div>
                    )
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="focus_time"
              stroke="var(--color-focus_time)"
              strokeWidth={2}
              dot={false}
              name="Focus Time"
            />
            <Line
              type="monotone"
              dataKey="break_time"
              stroke="var(--color-break_time)"
              strokeWidth={2}
              dot={false}
              name="Break Time"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
