import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { FocusTimeChart } from "./focus-time-chart";
import { TaskCompletionChart } from "./task-completion-chart";
import { SessionDurationChart } from "./session-duration-chart";
import { ProductivityOverview } from "./productivity-overview";
import { InsightsCard } from "./insights-card";
import { ActivityTimeline } from "./activity-timeline";
import { analyticsAPI, type AnalyticsDashboard } from "~/lib/analytics";
import { useAuthStore } from "~/stores/auth";
import { useAnalyticsStore } from "~/stores/analytics";
import { toast } from "sonner";
import { SidebarTrigger } from "~/components/ui/sidebar";
import {
  Clock,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Calendar,
  LogIn,
  PlusCircle,
} from "lucide-react";

interface AnalyticsDashboardProps {
  className?: string;
}

export function AnalyticsDashboard({ className }: AnalyticsDashboardProps) {
  const { user, token } = useAuthStore();
  const analyticsStore = useAnalyticsStore();
  const [dashboardData, setDashboardData] = useState<AnalyticsDashboard | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30");
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    if (!token) {
      toast.error("Please log in to view analytics");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Ensure any queued analytics events are flushed before fetching
      await analyticsStore.flushEvents().catch(() => {});
      // Force a daily stats recomputation so the dashboard isn't empty
      await analyticsAPI.updateDailyStats().catch(() => {});
      const data = await analyticsAPI.getDashboard(parseInt(timeRange));
      setDashboardData(data);
    } catch (error) {
      console.error("Failed to fetch analytics dashboard:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await analyticsAPI.updateDailyStats();
      await fetchDashboardData();
      toast.success("Analytics data refreshed");
    } catch (error) {
      console.error("Failed to refresh analytics:", error);
      toast.error("Failed to refresh analytics data");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Flush queued events when the time range or token changes so charts aren't empty
    fetchDashboardData();
  }, [timeRange, token]);

  // Refresh dashboard when tasks or sessions change elsewhere
  useEffect(() => {
    const handler = () => {
      handleRefresh();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("task-completed", handler);
      window.addEventListener("task-uncompleted", handler);
      window.addEventListener("session-completed", handler);
      window.addEventListener("session-reset", handler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("task-completed", handler);
        window.removeEventListener("task-uncompleted", handler);
        window.removeEventListener("session-completed", handler);
        window.removeEventListener("session-reset", handler);
      }
    };
  }, []);

  // Show login prompt if not authenticated
  if (!token) {
    return (
      <main className="flex flex-col pb-8 gap-8 p-8 bg-gradient-to-br from-background via-background/95 to-muted/20 min-h-screen">
        <div className="w-full flex justify-between items-center backdrop-blur-md bg-card/70 rounded-3xl p-6 border border-border/40 shadow-xl shadow-primary/5">
          <SidebarTrigger />
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-border/30">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse"></div>
              <BarChart3 className="h-4 w-4" />
              <span className="font-medium">Authentication Required</span>
            </div>
          </div>
        </div>

        <Card className="flex-1 backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-2xl shadow-primary/5 hover:shadow-3xl hover:shadow-primary/10 transition-all duration-500 rounded-3xl overflow-hidden">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-lg">
              <LogIn className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              Authentication Required
            </h3>
            <p className="text-muted-foreground mb-8 text-lg leading-relaxed max-w-md mx-auto">
              Please log in to view your analytics dashboard and track your
              productivity journey
            </p>
            <Button
              onClick={() => (window.location.href = "/login")}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-xl hover:shadow-2xl hover:shadow-primary/20 transition-all duration-300 rounded-2xl px-8 py-3 text-base font-medium"
            >
              <LogIn className="h-5 w-5" />
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex flex-col pb-8 gap-8 p-8 bg-gradient-to-br from-background via-background/95 to-muted/20 min-h-screen">
        <div className="w-full flex justify-between items-center backdrop-blur-md bg-card/70 rounded-xl p-4 border border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
          <SidebarTrigger />
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-border/30">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <BarChart3 className="h-4 w-4" />
              <span className="font-medium">Loading Analytics...</span>
            </div>
          </div>
        </div>

        {/* Loading Overview Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card
              key={i}
              className="backdrop-blur-md bg-card/80 border-border/40 shadow-xl shadow-primary/5 rounded-3xl overflow-hidden"
            >
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gradient-to-r from-muted/60 to-muted/40 rounded-xl w-3/4 mb-3"></div>
                  <div className="h-8 bg-gradient-to-r from-muted/60 to-muted/40 rounded-xl w-1/2 mb-3"></div>
                  <div className="h-3 bg-gradient-to-r from-muted/60 to-muted/40 rounded-xl w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Loading Charts */}
        <div className="grid gap-8 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card
              key={i}
              className="backdrop-blur-md bg-card/80 border-border/40 shadow-xl shadow-primary/5 rounded-3xl overflow-hidden"
            >
              <CardContent className="p-8">
                <div className="animate-pulse">
                  <div className="h-6 bg-gradient-to-r from-muted/60 to-muted/40 rounded-xl w-1/2 mb-6"></div>
                  <div className="h-64 bg-gradient-to-br from-muted/60 to-muted/40 rounded-2xl"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    );
  }

  if (!dashboardData) {
    return (
      <main className="flex flex-col pb-8 gap-8 p-8 bg-gradient-to-br from-background via-background/95 to-muted/20 min-h-screen">
        <div className="w-full flex justify-between items-center backdrop-blur-md bg-card/70 rounded-xl p-4 border border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
          <SidebarTrigger />
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-border/30">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
              <BarChart3 className="h-4 w-4" />
              <span className="font-medium">No Data Available</span>
            </div>
          </div>
        </div>

        <Card className="flex-1 backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-2xl shadow-primary/5 hover:shadow-3xl hover:shadow-primary/10 transition-all duration-500 rounded-3xl overflow-hidden">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-lg">
              <PlusCircle className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              No Analytics Data Available
            </h3>
            <p className="text-muted-foreground mb-8 text-lg leading-relaxed max-w-md mx-auto">
              Start using Pomotoro to generate analytics data and track your
              productivity patterns
            </p>
            <Button
              onClick={fetchDashboardData}
              className="inline-flex items-center gap-3 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-xl hover:shadow-2xl hover:shadow-primary/20 transition-all duration-300 rounded-2xl px-8 py-3 text-base font-medium"
            >
              <RefreshCw className="h-5 w-5" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-col pb-8 gap-8 p-8  min-h-screen">
      {/* Header Bar */}
      <div className="w-full flex justify-between items-center backdrop-blur-md bg-card/70 rounded-xl p-4 border border-border/40 shadow-lg shadow-primary/5 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              Insights
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gradient-to-r from-muted/40 to-muted/30 px-4 py-2.5 rounded-2xl backdrop-blur-sm border border-border/30">
            <div className="w-2 h-2 rounded-lg bg-primary animate-pulse"></div>
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {timeRange === "7"
                ? "Last 7 days"
                : timeRange === "14"
                ? "Last 14 days"
                : timeRange === "30"
                ? "Last 30 days"
                : timeRange === "60"
                ? "Last 60 days"
                : "Last 90 days"}
            </span>
          </div>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px] rounded-2xl border-border/40 bg-background/50 backdrop-blur-sm hover:bg-card/70 transition-all duration-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-border/40 bg-card/90 backdrop-blur-md">
              <SelectItem value="7" className="rounded-xl">7 days</SelectItem>
              <SelectItem value="14" className="rounded-xl">14 days</SelectItem>
              <SelectItem value="30" className="rounded-xl">30 days</SelectItem>
              <SelectItem value="60" className="rounded-xl">60 days</SelectItem>
              <SelectItem value="90" className="rounded-xl">90 days</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="default"
            className="rounded-2xl hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 px-6"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <ProductivityOverview stats={dashboardData.daily_stats} />

      {/* Main Content Tabs */}
      <Card className="backdrop-blur-md bg-card/80 border-border/40 shadow-2xl shadow-primary/5 hover:shadow-3xl hover:shadow-primary/10 transition-all duration-500 rounded-3xl overflow-hidden">
        <CardContent className="py-2">
          <Tabs defaultValue="overview" className="space-y-8">
            <div className="flex justify-start items-center mb-8">
              <TabsList className="rounded-2xl bg-muted/30 backdrop-blur-sm border border-border/30 p-1.5">
                <TabsTrigger value="overview" className="rounded-xl data-[state=active]:bg-card/70 data-[state=active]:shadow-lg transition-all duration-300">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="focus" className="rounded-xl data-[state=active]:bg-card/70 data-[state=active]:shadow-lg transition-all duration-300">
                  <Clock className="h-4 w-4 mr-2" />
                  Focus
                </TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-xl data-[state=active]:bg-card/70 data-[state=active]:shadow-lg transition-all duration-300">
                  <Calendar className="h-4 w-4 mr-2" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="insights" className="rounded-xl data-[state=active]:bg-card/70 data-[state=active]:shadow-lg transition-all duration-300">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Insights
                </TabsTrigger>
                <TabsTrigger value="activity" className="rounded-xl data-[state=active]:bg-card/70 data-[state=active]:shadow-lg transition-all duration-300">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Activity
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="space-y-8">
              <div className="grid gap-8 md:grid-cols-2">
                <FocusTimeChart data={dashboardData.focus_time_trend} />
                <TaskCompletionChart
                  data={dashboardData.task_completion_trend}
                />
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <SessionDurationChart
                  data={dashboardData.session_duration_distribution}
                />
                <InsightsCard insights={dashboardData.productivity_insights} />
              </div>
            </TabsContent>

            <TabsContent value="focus" className="space-y-8">
              <FocusTimeChart data={dashboardData.focus_time_trend} />
              <div className="grid gap-8 md:grid-cols-2">
                <Card className="backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-xl shadow-primary/5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 rounded-2xl overflow-hidden">
                  <CardHeader className=" border-b border-border/30">
                    <CardTitle className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      Focus Time Statistics
                    </CardTitle>
                    <CardDescription>
                      Detailed breakdown of your focus time over the past week
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      {dashboardData.daily_stats
                        .slice(-7)
                        .map((stat, index) => (
                          <div
                            key={index}
                            className="flex justify-between items-center p-4 rounded-2xl bg-gradient-to-r from-muted/20 to-muted/10 hover:from-muted/30 hover:to-muted/20 transition-all duration-300 group border border-border/20 hover:border-border/40 hover:shadow-lg"
                          >
                            <span className="text-sm text-muted-foreground font-medium">
                              {new Date(stat.date).toLocaleDateString()}
                            </span>
                            <div className="text-right">
                              <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                                {(stat.total_focus_time / 3600).toFixed(1)}h
                              </div>
                              <div className="text-xs text-muted-foreground">
                                focus time
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
                <SessionDurationChart
                  data={dashboardData.session_duration_distribution}
                />
              </div>
            </TabsContent>

            <TabsContent value="tasks" className="space-y-8">
              <TaskCompletionChart data={dashboardData.task_completion_trend} />
              <Card className="backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-xl shadow-primary/5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 rounded-2xl overflow-hidden">
                <CardHeader className=" border-b border-border/30">
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    Task Completion Statistics
                  </CardTitle>
                  <CardDescription>
                    Your task completion patterns over the past week
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {dashboardData.daily_stats.slice(-7).map((stat, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-4 rounded-2xl bg-gradient-to-r from-muted/20 to-muted/10 hover:from-muted/30 hover:to-muted/20 transition-all duration-300 group border border-border/20 hover:border-border/40 hover:shadow-lg"
                      >
                        <span className="text-sm text-muted-foreground font-medium">
                          {new Date(stat.date).toLocaleDateString()}
                        </span>
                        <div className="text-right">
                          <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                            {stat.tasks_completed} tasks
                          </div>
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

            <TabsContent value="insights" className="space-y-8">
              <InsightsCard insights={dashboardData.productivity_insights} />
              <Card className="backdrop-blur-md bg-gradient-to-br from-card/90 to-card/70 border-border/40 shadow-xl shadow-primary/5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 rounded-2xl overflow-hidden">
                <CardHeader className="border-b border-border/30">
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    Activity History
                  </CardTitle>
                  <CardDescription>
                    Your recent activity and productivity patterns
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {dashboardData.daily_stats.slice(-14).map((stat, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-4 rounded-2xl bg-gradient-to-r from-muted/20 to-muted/10 hover:from-muted/30 hover:to-muted/20 transition-all duration-300 group border border-border/20 hover:border-border/40 hover:shadow-lg"
                      >
                        <span className="text-sm text-muted-foreground font-medium">
                          {new Date(stat.date).toLocaleDateString()}
                        </span>
                        <div className="text-right">
                          <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                            {(stat.total_focus_time / 3600).toFixed(1)}h focus
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {stat.tasks_completed} tasks •{" "}
                            {stat.pomodoros_completed} pomodoros
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-8">
              <ActivityTimeline events={dashboardData.recent_events} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
