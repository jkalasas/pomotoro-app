import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import type { ChartDataPoint } from '~/lib/analytics';

interface TaskCompletionChartProps {
  data: ChartDataPoint[];
}

export function TaskCompletionChart({ data }: TaskCompletionChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Completion Trend</CardTitle>
        <CardDescription>
          Daily completed tasks and sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number, name: string) => [
                value, 
                name === 'completed' ? 'Tasks Completed' : 'Sessions Completed'
              ]}
            />
            <Legend />
            <Bar dataKey="completed" fill="#8884d8" name="Tasks Completed" />
            <Bar dataKey="sessions" fill="#82ca9d" name="Sessions Completed" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
