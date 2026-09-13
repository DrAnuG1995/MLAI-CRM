import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  GlobalSearchTrigger,
  GlobalSearchDialog,
  useGlobalSearchShortcut,
} from "./shared/components/GlobalSearch";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  CalendarDays,
  UserCog,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems: Array<{
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
}> = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/people", icon: Users, label: "People" },
  { to: "/organisations", icon: Building2, label: "Organisations" },
  { to: "/pipeline", icon: Handshake, label: "Pipeline" },
  { to: "/events", icon: CalendarDays, label: "Events" },
  { to: "/team", icon: UserCog, label: "Team" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-[#A4D65E]/20 text-[#A4D65E]"
      : "text-white/70 hover:bg-white/10 hover:text-white"
  );

export default function CrmLayout() {
  const navigate = useNavigate();
  const { open: searchOpen, setOpen: setSearchOpen } = useGlobalSearchShortcut();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Show who's signed in: every logged touch and stage move is attributed
  // to this account, so the committee member should be able to check it.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) setUserEmail(user?.email || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="crm-theme min-h-full">
      <SidebarProvider>
        <Sidebar className="border-r-0">
          <SidebarHeader className="bg-[#1F3A6A] px-4 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#A4D65E] text-sm font-bold text-[#1F3A6A]">
                ML
              </span>
              <span className="text-lg font-bold tracking-tight text-white">MLAI</span>
              <span className="text-sm font-medium text-white/60">CRM</span>
            </div>
          </SidebarHeader>
          <SidebarContent className="bg-[#1F3A6A]">
            <SidebarGroup>
              <SidebarGroupLabel className="px-4 text-xs font-semibold uppercase tracking-wider text-white/50">
                Modules
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild>
                        <NavLink to={item.to} end={item.end} className={linkClass}>
                          <item.icon className="h-5 w-5 shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="bg-[#1F3A6A] p-4 space-y-1">
            {userEmail && (
              <div className="mb-2 truncate px-2 py-1 text-xs text-white/60" title={`Signed in as ${userEmail}`}>
                Signed in as <span className="font-medium text-white/90">{userEmail}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign out</span>
            </button>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex-1" />
            <GlobalSearchTrigger onClick={() => setSearchOpen(true)} />
            <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
          </header>
          <main className="flex-1 overflow-auto bg-gray-50 p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
