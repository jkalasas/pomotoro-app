import { AnalyticsDashboard } from "~/components/analytics/analytics-dashboard";

export function meta() {
  return [
    { title: "Analytics - Pomodoro Tracker" },
    { name: "description", content: "View your productivity analytics and insights" },
  ];
}

export default function Analytics() {
  return (
    <div className="container mx-auto p-6">
      <AnalyticsDashboard />
    </div>
  );
}
