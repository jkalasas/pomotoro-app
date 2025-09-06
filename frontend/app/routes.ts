import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("pomodoro", "routes/pomodoro.tsx"),
  route("sessions", "routes/sessions.tsx"),
  route("overlay", "routes/overlay.tsx"),
  route("analytics", "routes/analytics.tsx"),
] satisfies RouteConfig;
