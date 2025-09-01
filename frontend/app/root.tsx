import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon, type TrayIconOptions } from "@tauri-apps/api/tray";
import type { Route } from "./+types/root";
import "./app.css";
import Titlebar from "./components/pomotoro/titlebar";
import { useWindowStore } from "./stores/window";
import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { usePomodoroStore } from "./stores/pomodoro";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "./components/ui/sidebar";
import AppSidebar from "./components/pomotoro/navs/AppSidebar";
import { Button } from "./components/ui/button";
import { VolumeOff } from "lucide-react";
import { AuthForm } from "./components/auth/AuthForm";
import { useAuthStore } from "./stores/auth";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const authStore = useAuthStore();
  const pomodoroStore = usePomodoroStore();
  const initWindow = useWindowStore((state) => state.initWindow);

  const [tray, setTray] = useState<TrayIcon>();

  useEffect(() => {
    // Load user on app start
    if (authStore.token && !authStore.user) {
      authStore.loadUser();
    }

    initWindow();

    (async () => {
      const menu = await Menu.new({
        items: [{ id: "quit", text: "Quit " }],
      });

      const trayOptions: TrayIconOptions = {
        menu,
      };

      setTray(await TrayIcon.new(trayOptions));
    })();
  }, [authStore, pomodoroStore, initWindow]);

  // Show auth form if not authenticated
  if (!authStore.user && !authStore.isLoading) {
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <Meta />
          <Links />
        </head>
        <body onContextMenu={(e) => e.preventDefault()}>
          <AuthForm />
          <Toaster />
          <ScrollRestoration />
          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body onContextMenu={(e) => e.preventDefault()}>
        <Titlebar />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <main>{children}</main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
