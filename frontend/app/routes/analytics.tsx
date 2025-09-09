import { useEffect } from "react";
import { AnalyticsDashboard } from "~/components/analytics/analytics-dashboard";
import { useAnalyticsStore } from "~/stores/analytics";

export function meta() {
  return [
    { title: "Analytics - Pomodoro Tracker" },
  { name: "description", content: "View your productivity analytics" },
  ];
}

export default function Analytics() {
  const analyticsStore = useAnalyticsStore();

  useEffect(() => {
    // No need to log page navigation for analytics
  }, [analyticsStore]);

  return (
    <div className="container mx-auto p-6">
      <AnalyticsDashboard />
    </div>
  );
}
