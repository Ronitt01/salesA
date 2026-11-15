"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  Bell,
  ChevronRight,
  CircleAlert,
  FlaskConical,
  LogOut,
  Menu,
  PanelLeft,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative, initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/server/auth/actions";
import { HunterMark } from "./hunter-mark";
import { NAV_ITEMS, activeNavItem } from "./nav";

export interface ShellNotification {
  id: string;
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  detail: string;
  href: string;
  at: string;
}

export interface ShellStatusItem {
  label: string;
  value: string;
  tone: "ok" | "notice" | "alert";
}

export interface AppShellProps {
  user: { email: string; fullName: string | null };
  workspace: { name: string };
  role: keyof typeof ROLE_LABEL;
  hasDemoData: boolean;
  status: ShellStatusItem[];
  notifications: ShellNotification[];
  /** Server render time, so relative times match between server and client. */
  renderedAt: string;
  children: React.ReactNode;
  /** Floating assistant, rendered above page content. */
  assistant?: React.ReactNode;
}

const COLLAPSE_KEY = "hunter.sidebar.collapsed";
const SIDEBAR_EVENT = "hunter:sidebar";

function subscribeToSidebar(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_EVENT, onChange);
  };
}

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

const TONE_DOT: Record<ShellNotification["tone"], string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);

  return (
    <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {!collapsed ? (
        <p className="px-3 pt-2 pb-1.5 text-[11px] font-medium tracking-wider text-subtle uppercase">Navigation</p>
      ) : null}
      {NAV_ITEMS.map((item) => {
        const isActive = active?.href === item.href;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
              isActive && "bg-sidebar-accent font-medium text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function SidebarBody({
  collapsed,
  props,
  onNavigate,
}: {
  collapsed: boolean;
  props: AppShellProps;
  onNavigate?: () => void;
}) {
  const displayName = props.user.fullName ?? props.user.email;
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <HunterMark className="size-7 shrink-0" />
        {!collapsed ? <span className="text-[15px] font-semibold tracking-tight">HUNTER</span> : null}
      </div>

      {!collapsed ? (
        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="text-[11px] font-medium tracking-wider text-subtle uppercase">Workspace</p>
          <p className="mt-1 truncate text-sm font-medium">{props.workspace.name}</p>
          <p className="truncate text-xs text-muted-foreground">India · SMEs with 10–200 employees</p>
        </div>
      ) : null}

      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />

      <div className={cn("flex shrink-0 items-center gap-3 border-t border-sidebar-border p-3", collapsed && "justify-center")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium">
          {initials(displayName)}
        </div>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[props.role]}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const item = activeNavItem(pathname);
  const isDetail = item ? pathname !== item.href : false;
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <span className="text-muted-foreground">HUNTER</span>
      {item ? (
        <>
          <ChevronRight className="size-3.5 shrink-0 text-subtle" />
          {isDetail ? (
            <Link href={item.href} className="truncate text-muted-foreground hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span className="truncate font-medium" aria-current="page">
              {item.label}
            </span>
          )}
        </>
      ) : null}
      {isDetail ? (
        <>
          <ChevronRight className="size-3.5 shrink-0 text-subtle" />
          <span className="font-medium" aria-current="page">
            Details
          </span>
        </>
      ) : null}
    </nav>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative hidden w-64 lg:block xl:w-80"
      onSubmit={(event) => {
        event.preventDefault();
        const q = inputRef.current?.value.trim() ?? "";
        startTransition(() => router.push(q ? `/leads?q=${encodeURIComponent(q)}` : "/leads"));
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
      <Input
        ref={inputRef}
        name="q"
        aria-label="Search companies and contacts"
        placeholder="Search leads"
        className={cn("h-8 bg-muted pr-12 pl-8 text-sm", pending && "opacity-70")}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 text-[10px] text-subtle">
        Ctrl K
      </kbd>
    </form>
  );
}

function SystemStatus({ items }: { items: ShellStatusItem[] }) {
  const worst = items.some((i) => i.tone === "alert") ? "alert" : items.some((i) => i.tone === "notice") ? "notice" : "ok";
  const dot = { ok: "bg-success", notice: "bg-warning", alert: "bg-danger" } as const;
  const summary = { ok: "All systems normal", notice: "Running in local mode", alert: "Attention needed" } as const;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 px-2 text-xs text-muted-foreground" aria-label={`System status: ${summary[worst]}`}>
          <span className={cn("size-2 rounded-full", dot[worst])} />
          <span className="hidden xl:inline">{summary[worst]}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-4 py-3 text-sm font-medium">System status</p>
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="flex items-center gap-2 text-right">
                <span className={cn("size-1.5 shrink-0 rounded-full", dot[item.tone])} />
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Notifications({ items, renderedAt }: { items: ShellNotification[]; renderedAt: string }) {
  const now = new Date(renderedAt);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative text-muted-foreground" aria-label={`Notifications (${items.length})`}>
          <Bell />
          {items.length > 0 ? (
            <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-info text-[9px] font-semibold text-white">
              {items.length > 9 ? "9+" : items.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <p className="border-b px-4 py-3 text-sm font-medium">Notifications</p>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing needs your attention.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[n.tone])} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{n.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs text-subtle">{formatRelative(n.at, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ props }: { props: AppShellProps }) {
  const displayName = props.user.fullName ?? props.user.email;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Account menu">
          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            {initials(displayName)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">{props.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Workspace settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell(props: AppShellProps) {
  // The sidebar preference lives in localStorage; the server snapshot is "expanded".
  const collapsed = useSyncExternalStore(subscribeToSidebar, readSidebarCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // Storage can be unavailable (private mode); the preference will not persist.
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-150 lg:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarBody collapsed={collapsed} props={props} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody collapsed={false} props={props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden text-muted-foreground lg:inline-flex"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
          >
            <PanelLeft />
          </Button>
          <HunterMark className="size-6 lg:hidden" />
          <Breadcrumbs />

          <div className="ml-auto flex items-center gap-1.5">
            <GlobalSearch />
            {props.hasDemoData ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-1 inline-flex h-7 cursor-default items-center gap-1.5 rounded-full border border-warning/50 px-2.5 text-[11px] font-semibold tracking-wide text-warning uppercase">
                    <FlaskConical className="size-3.5" />
                    <span className="hidden sm:inline">Demo · synthetic data</span>
                    <span className="sm:hidden">Demo</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  This workspace contains synthetic companies, contacts and activity. None of it is real research,
                  and no message was sent to anyone. Reset or remove it in Settings.
                </TooltipContent>
              </Tooltip>
            ) : null}
            <SystemStatus items={props.status} />
            <Notifications items={props.notifications} renderedAt={props.renderedAt} />
            <UserMenu props={props} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-8 lg:py-7">{props.children}</main>
      </div>

      {props.assistant}
    </div>
  );
}

export function ShellErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-card p-6">
        <CircleAlert className="size-6 text-warning" />
        <h1 className="mt-3 text-base font-semibold">HUNTER could not load your workspace</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
