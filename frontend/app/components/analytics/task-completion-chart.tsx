import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
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

interface TaskCompletionChartProps {
  data: ChartDataPoint[];
}

export function TaskCompletionChart({ data }: TaskCompletionChartProps) {
  const chartConfig: ChartConfig = {
    completed: {
      label: "Tasks Completed",
      color: "#8884d8",
    },
    sessions: {
      label: "Sessions Completed",
      color: "#82ca9d",
    },
    date: {
      label: "Date",
    },
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Completion Trend</CardTitle>
        <CardDescription>
          Daily completed tasks and sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-xs sm:w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--muted))' }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(v) => {
                    try {
                      return new Date(String(v)).toLocaleDateString();
                    } catch {
                      return String(v);
                    }
                  }}
                  formatter={(value, name) => {
                    return (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-muted-foreground">{name}:</span>
                        <span className="text-foreground font-mono">{value}</span>
                      </div>
                    )
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="completed" fill="var(--color-completed)" name="Tasks Completed" radius={[4,4,0,0]} />
            <Bar dataKey="sessions" fill="var(--color-sessions)" name="Sessions Completed" radius={[4,4,0,0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
