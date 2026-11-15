import {
  Building2,
  CalendarDays,
  ChartColumn,
  Crosshair,
  Globe,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/leads", label: "Lead Explorer", icon: Crosshair },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/conversations", label: "Conversation Centre", icon: MessagesSquare },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/market-intelligence", label: "Market Intelligence", icon: Globe },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
