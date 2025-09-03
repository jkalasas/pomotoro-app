import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import type { ChartDataPoint } from '~/lib/analytics';

interface FocusTimeChartProps {
  data: ChartDataPoint[];
}

export function FocusTimeChart({ data }: FocusTimeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus Time Trend</CardTitle>
        <CardDescription>
          Your daily focus and break time over the past weeks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)} hours`, 
                name === 'focus_time' ? 'Focus Time' : 'Break Time'
              ]}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="focus_time" 
              stroke="#8884d8" 
              strokeWidth={2}
              name="Focus Time"
            />
            <Line 
              type="monotone" 
              dataKey="break_time" 
              stroke="#82ca9d" 
              strokeWidth={2}
              name="Break Time"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
