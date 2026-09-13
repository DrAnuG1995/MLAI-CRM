import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, User, Building2, Handshake, CalendarDays } from "lucide-react";

type Hit = { id: string; title: string; sub: string; to: string; icon: React.ElementType };

/** ⌘K / Ctrl+K opens the search dialog, same as the StatDoctor CRM. */
export function useGlobalSearchShortcut() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function GlobalSearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 w-44 items-center gap-2 whitespace-nowrap rounded-md border bg-gray-50 px-3 text-sm text-muted-foreground hover:bg-gray-100"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border bg-white px-1.5 text-[10px] font-medium">⌘K</kbd>
    </button>
  );
}

export function GlobalSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  // One lightweight fetch of names per open; filtering is client-side so
  // typing feels instant. Fine for a community-sized CRM.
  const { data } = useQuery({
    queryKey: ["global-search-index"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [p, o, d, e] = await Promise.all([
        supabase.from("people").select("id, full_name, email, role_title, organisation:organisations(name)").limit(2000),
        supabase.from("organisations").select("id, name, kind, location").limit(2000),
        supabase.from("deals").select("id, name, kind, organisation:organisations(name)").limit(2000),
        supabase.from("events").select("id, title, kind, starts_at").limit(2000),
      ]);
      const hits: Hit[] = [];
      for (const r of (p.data ?? []) as any[]) hits.push({ id: r.id, title: r.full_name, sub: [r.role_title, r.organisation?.name, r.email].filter(Boolean).join(" · "), to: `/people/${r.id}`, icon: User });
      for (const r of (o.data ?? []) as any[]) hits.push({ id: r.id, title: r.name, sub: [r.kind, r.location].filter(Boolean).join(" · "), to: `/organisations/${r.id}`, icon: Building2 });
      for (const r of (d.data ?? []) as any[]) hits.push({ id: r.id, title: r.name, sub: [r.kind, r.organisation?.name].filter(Boolean).join(" · "), to: `/pipeline?deal=${r.id}`, icon: Handshake });
      for (const r of (e.data ?? []) as any[]) hits.push({ id: r.id, title: r.title, sub: [r.kind, r.starts_at?.slice(0, 10)].filter(Boolean).join(" · "), to: `/events/${r.id}`, icon: CalendarDays });
      return hits;
    },
  });

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !data) return [];
    return data.filter((h) => `${h.title} ${h.sub}`.toLowerCase().includes(s)).slice(0, 12);
  }, [q, data]);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-24 translate-y-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, organisations, deals, events"
            className="border-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) { navigate(results[0].to); onOpenChange(false); }
            }}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {q && results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No matches</li>}
          {results.map((h) => (
            <li key={h.to}>
              <button
                onClick={() => { navigate(h.to); onOpenChange(false); }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50"
              >
                <h.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{h.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
