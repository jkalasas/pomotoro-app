import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("pomodoro", "routes/pomodoro.tsx"),
] satisfies RouteConfig;
