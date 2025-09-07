import {
  ChartPie,
  Hourglass,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { Logo } from "~/components/ui/logo";
import { cn } from "~/lib/utils";
import { useAuthStore } from "~/stores/auth";
import { Button } from "~/components/ui/button";
import { LogOut } from "lucide-react";

interface SidebarItem {
  label: string;
  url: string;
  icon: LucideIcon;
}

const items: SidebarItem[] = [
  {
    label: "My Tasks",
    url: "/",
    icon: Hourglass,
  },
  {
    label: "Sessions",
    url: "/sessions",
    icon: Settings,
  },
  {
    label: "Insight",
    url: "/analytics",
    icon: ChartPie,
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <Sidebar className="mt-10" variant="inset">
      <SidebarHeader className="mt-10 lg:mt-0 mb-4">
        <div className="px-4 py-2">
          <Logo showText className="h-8 w-8" textClassName="text-lg font-bold" />
        </div>
        {user && (
        <div className="flex justify-between gap-3 bg-secondary/20 p-3 rounded-lg ">
          <div>
            <p className="text-sm font-medium">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-white/75">{user.email}</p>
          </div>
          <Button variant="ghost" size='sm' onClick={logout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                isActive={location.pathname === item.url}
                asChild
              >
                <Link to={item.url}>
                  <item.icon className="w-4 h-4 mr-2" />
                  {item.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
