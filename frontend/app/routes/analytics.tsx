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
    // Log page view
    analyticsStore.logNavigationEvent('unknown', 'analytics');
    analyticsStore.logUserAction('page_view', {
      page: 'analytics',
      timestamp: new Date().toISOString()
    });

    // Return cleanup function to log page exit if needed
    return () => {
      analyticsStore.logUserAction('page_exit', {
        page: 'analytics',
        timestamp: new Date().toISOString()
      });
    };
  }, [analyticsStore]);

  return (
    <div className="container mx-auto p-6">
      <AnalyticsDashboard />
    </div>
  );
}
