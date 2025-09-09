import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import type { ProductivityInsights } from '~/lib/analytics';

interface InsightsCardProps {
  insights: ProductivityInsights;
}

export function InsightsCard({ insights }: InsightsCardProps) {
  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'default';
      case 'declining':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return '📈';
      case 'declining':
        return '📉';
      default:
        return '➡️';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Productivity Insights</CardTitle>
        <CardDescription>
          Analysis of your productivity patterns
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">Most Productive Time</h4>
            <p className="text-sm text-muted-foreground">{insights.most_productive_time}</p>
          </div>
          
          <div>
            <h4 className="text-sm font-medium mb-2">Average Session Length</h4>
            <p className="text-sm text-muted-foreground">
              {insights.average_session_length.toFixed(1)} minutes
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Trends</h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getTrendColor(insights.focus_time_trend)}>
              {getTrendIcon(insights.focus_time_trend)} Focus Time: {insights.focus_time_trend}
            </Badge>
            <Badge variant={getTrendColor(insights.completion_rate_trend)}>
              {getTrendIcon(insights.completion_rate_trend)} Completion Rate: {insights.completion_rate_trend}
            </Badge>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Recommendations</h4>
          <ul className="space-y-2">
            {insights.recommendations.map((recommendation, index) => (
              <li key={index} className="text-sm text-muted-foreground flex items-start">
                <span className="mr-2">💡</span>
                {recommendation}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
