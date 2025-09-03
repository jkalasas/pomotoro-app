import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { FocusTimeChart } from './focus-time-chart';
import { TaskCompletionChart } from './task-completion-chart';
import { SessionDurationChart } from './session-duration-chart';
import { ProductivityOverview } from './productivity-overview';
import { InsightsCard } from './insights-card';
import { ActivityTimeline } from './activity-timeline';
import { analyticsAPI, type AnalyticsDashboard } from '~/lib/analytics';
import { useAuthStore } from '~/stores/auth';
import { toast } from 'sonner';

interface AnalyticsDashboardProps {
  className?: string;
}

export function AnalyticsDashboard({ className }: AnalyticsDashboardProps) {
  const { user, token } = useAuthStore();
  const [dashboardData, setDashboardData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30');
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    if (!token) {
      toast.error('Please log in to view analytics');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await analyticsAPI.getDashboard(parseInt(timeRange));
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to fetch analytics dashboard:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await analyticsAPI.updateDailyStats();
      await fetchDashboardData();
      toast.success('Analytics data refreshed');
    } catch (error) {
      console.error('Failed to refresh analytics:', error);
      toast.error('Failed to refresh analytics data');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange, token]);

  // Show login prompt if not authenticated
  if (!token) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
            <p className="text-muted-foreground mb-4">
              Please log in to view your analytics dashboard
            </p>
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No analytics data available</p>
            <Button onClick={fetchDashboardData} className="mt-4">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing}
            variant="outline"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <ProductivityOverview stats={dashboardData.daily_stats} />

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="focus">Focus Time</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FocusTimeChart data={dashboardData.focus_time_trend} />
            <TaskCompletionChart data={dashboardData.task_completion_trend} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SessionDurationChart data={dashboardData.session_duration_distribution} />
            <InsightsCard insights={dashboardData.productivity_insights} />
          </div>
        </TabsContent>

        <TabsContent value="focus" className="space-y-4">
          <FocusTimeChart data={dashboardData.focus_time_trend} />
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Focus Time Statistics</CardTitle>
                <CardDescription>
                  Detailed breakdown of your focus time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {dashboardData.daily_stats.slice(-7).map((stat, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        {new Date(stat.date).toLocaleDateString()}
                      </span>
                      <span className="font-medium">
                        {(stat.total_focus_time / 3600).toFixed(1)}h
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <SessionDurationChart data={dashboardData.session_duration_distribution} />
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <TaskCompletionChart data={dashboardData.task_completion_trend} />
          <Card>
            <CardHeader>
              <CardTitle>Task Completion Statistics</CardTitle>
              <CardDescription>
                Your task completion patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardData.daily_stats.slice(-7).map((stat, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {new Date(stat.date).toLocaleDateString()}
                    </span>
                    <div className="text-right">
                      <div className="font-medium">{stat.tasks_completed} tasks</div>
                      <div className="text-sm text-muted-foreground">
                        {stat.sessions_completed} sessions
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <InsightsCard insights={dashboardData.productivity_insights} />
          <Card>
            <CardHeader>
              <CardTitle>Productivity Heatmap</CardTitle>
              <CardDescription>
                Your productivity score over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {dashboardData.productivity_heatmap.slice(-28).map((data, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded flex items-center justify-center text-xs font-medium"
                    style={{
                      backgroundColor: `hsl(var(--primary) / ${(data.productivity || 0) / 100})`,
                      color: (data.productivity || 0) > 50 ? 'white' : 'inherit'
                    }}
                    title={`${new Date(data.date).toLocaleDateString()}: ${(data.productivity || 0).toFixed(0)}%`}
                  >
                    {(data.productivity || 0).toFixed(0)}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <ActivityTimeline events={dashboardData.recent_events} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
