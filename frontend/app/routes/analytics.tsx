import { useEffect } from "react";
import { AnalyticsDashboard } from "~/components/analytics/analytics-dashboard";
import { useAnalyticsStore } from "~/stores/analytics";

export function meta() {
  return [
    { title: "Analytics - Pomodoro Tracker" },
    { name: "description", content: "View your productivity analytics and insights" },
  ];
}

export default function Analytics() {
  const analyticsStore = useAnalyticsStore();

  useEffect(() => {
    // No need to log page navigation for analytics
  }, [analyticsStore]);

  return (
    <>
      <AnalyticsDashboard />
    </>
  );
}
