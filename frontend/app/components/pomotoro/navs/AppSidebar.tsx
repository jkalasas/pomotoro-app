import {
  CalendarClock,
  ChartPie,
  CircleUser,
  Hourglass,
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
    label: "Session Overview",
    url: "#",
    icon: CalendarClock,
  },
  {
    label: "Insight",
    url: "#",
    icon: ChartPie,
  },
  {
    label: "My Profile",
    url: "#",
    icon: CircleUser,
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <Sidebar className="mt-10" variant="inset">
      <SidebarHeader>
        {user && (
          <div className="px-4 py-2">
            <p className="text-sm font-medium">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
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
        <div className="px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
