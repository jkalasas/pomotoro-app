import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Clock } from 'lucide-react';
import type { ChartDataPoint } from '~/lib/analytics';

interface FocusTimeChartProps {
  data: ChartDataPoint[];
}

export function FocusTimeChart({ data }: FocusTimeChartProps) {
  return (
    <Card className="backdrop-blur-sm bg-card/90 border-border/50 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Focus Time Trend
        </CardTitle>
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
