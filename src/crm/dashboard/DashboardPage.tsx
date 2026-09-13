import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatAUD, formatDate, timeAgo, todayISO, daysSince } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { StatusBadge } from "../shared/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, Handshake, Trophy, CalendarDays, Activity as ActivityIcon } from "lucide-react";
import { FOLLOW_UP_DAYS, label } from "../shared/types";
import type { Person, Deal, Event, PipelineStage, Activity } from "../shared/types";

function useMetrics() {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      const today = todayISO();
      const yearStart = `${today.slice(0, 4)}-01-01`;
      const [people, orgs, stages, deals, events, upcoming, activity] = await Promise.all([
        supabase.from("people").select("id, full_name, type, role_title, last_touch_at, organisation:organisations(name)").eq("status", "active"),
        supabase.from("organisations").select("id, tier, status"),
        supabase.from("pipeline_stages").select("*").order("position"),
        supabase.from("deals").select("id, name, value, stage_id, due_date, next_step, updated_at, organisation:organisations(name)"),
        supabase.from("events").select("id, starts_at, status, capacity").lt("starts_at", `${today}T00:00:00`).neq("status", "cancelled"),
        supabase.from("events").select("id, title, kind, starts_at, venue, capacity, status").gte("starts_at", `${today}T00:00:00`).neq("status", "cancelled").order("starts_at").limit(6),
        supabase.from("activity_feed").select("*, profile:profiles(full_name, email)").order("created_at", { ascending: false }).limit(10),
      ]);
      for (const r of [people, orgs, stages, deals, events, upcoming, activity]) if (r.error) throw r.error;

      const stageList = stages.data as PipelineStage[];
      const openIds = new Set(stageList.filter((s) => !s.is_closed).map((s) => s.id));
      const wonIds = new Set(stageList.filter((s) => s.is_won).map((s) => s.id));
      const allDeals = deals.data as unknown as Deal[];
      const open = allDeals.filter((d) => openIds.has(d.stage_id));
      const wonThisYear = allDeals.filter((d) => wonIds.has(d.stage_id) && d.updated_at >= yearStart);
      const overdue = open.filter((d) => d.due_date && d.due_date < today);
      const dueSoon = open.filter((d) => d.due_date && d.due_date >= today && daysSince(d.due_date) > -7);
      const stale = (people.data as unknown as Person[])
        .filter((p) => ["sponsor_contact", "partner", "speaker"].includes(p.type) && daysSince(p.last_touch_at) > FOLLOW_UP_DAYS)
        .sort((a, b) => daysSince(b.last_touch_at) - daysSince(a.last_touch_at));

      // Attendance for the past-event average — one query over the join table
      const pastIds = (events.data as Event[]).map((e) => e.id);
      let avgAttendance = 0;
      if (pastIds.length) {
        const { data: att } = await supabase.from("event_people").select("event_id").in("event_id", pastIds).eq("role", "attendee").neq("rsvp", "no_show");
        avgAttendance = Math.round((att?.length ?? 0) / pastIds.length);
      }

      const sumValue = (ds: Deal[]) => ds.reduce((a, d) => a + Number(d.value || 0), 0);
      return {
        people: people.data!.length,
        stale,
        orgs: orgs.data!.length,
        tieredSponsors: orgs.data!.filter((o: any) => o.tier && o.status === "active").length,
        openCount: open.length,
        openValue: sumValue(open),
        overdue,
        dueSoon,
        wonCount: wonThisYear.length,
        wonValue: sumValue(wonThisYear),
        upcoming: upcoming.data as Event[],
        pastCount: pastIds.length,
        avgAttendance,
        stages: stageList.map((s) => {
          const ds = allDeals.filter((d) => d.stage_id === s.id);
          return { ...s, count: ds.length, value: sumValue(ds) };
        }),
        activity: activity.data as unknown as Activity[],
        year: today.slice(0, 4),
      };
    },
  });
}

function MetricCard({ title, value, subtitle, icon: Icon, onClick }: { title: string; value: string | number; subtitle: string; icon: React.ElementType; onClick?: () => void }) {
  return (
    <Card onClick={onClick} className={onClick ? "cursor-pointer transition-shadow hover:shadow-md" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-[#008080]">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: m, isLoading } = useMetrics();
  const v = (x: string | number) => (isLoading || !m ? "…" : x);
  const maxStage = Math.max(1, ...(m?.stages.map((s) => s.count) ?? [1]));

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of the MLAI community" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard title="People" value={v(m?.people ?? 0)} subtitle={`${m?.stale.length ?? 0} need a follow-up`} icon={Users} onClick={() => navigate("/people")} />
        <MetricCard title="Organisations" value={v(m?.orgs ?? 0)} subtitle={`${m?.tieredSponsors ?? 0} active tiered sponsors`} icon={Building2} onClick={() => navigate("/organisations")} />
        <MetricCard title="Open pipeline" value={v(formatAUD(m?.openValue))} subtitle={`${m?.openCount ?? 0} open · ${m?.overdue.length ?? 0} overdue`} icon={Handshake} onClick={() => navigate("/pipeline")} />
        <MetricCard title={`Won in ${m?.year ?? ""}`} value={v(formatAUD(m?.wonValue))} subtitle={`${m?.wonCount ?? 0} deal${m?.wonCount === 1 ? "" : "s"}`} icon={Trophy} onClick={() => navigate("/pipeline")} />
        <MetricCard title="Events" value={v(m?.upcoming.length ?? 0)} subtitle={`upcoming · avg ${m?.avgAttendance ?? 0} at ${m?.pastCount ?? 0} past`} icon={CalendarDays} onClick={() => navigate("/events")} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Needs a follow-up</CardTitle></CardHeader>
          <CardContent className="p-0">
            {m && m.overdue.length + m.dueSoon.length + m.stale.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">All caught up — no sponsor, partner or speaker contact has gone {FOLLOW_UP_DAYS} days without a touch.</p>
            ) : (
              <ul className="divide-y">
                {m?.overdue.map((d) => (
                  <li key={d.id} onClick={() => navigate(`/pipeline?deal=${d.id}`)} className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-gray-50">
                    <StatusBadge status="overdue" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.name}</span><span className="block truncate text-xs text-muted-foreground">{d.next_step || d.organisation?.name}</span></span>
                    <span className="text-xs text-muted-foreground">{formatDate(d.due_date)}</span>
                  </li>
                ))}
                {m?.dueSoon.map((d) => (
                  <li key={d.id} onClick={() => navigate(`/pipeline?deal=${d.id}`)} className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-gray-50">
                    <StatusBadge status="due" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.name}</span><span className="block truncate text-xs text-muted-foreground">{d.next_step || d.organisation?.name}</span></span>
                    <span className="text-xs text-muted-foreground">{formatDate(d.due_date)}</span>
                  </li>
                ))}
                {m?.stale.slice(0, 8).map((p) => (
                  <li key={p.id} onClick={() => navigate(`/people/${p.id}`)} className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-gray-50">
                    <StatusBadge status={p.type} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.full_name}</span><span className="block truncate text-xs text-muted-foreground">{[p.role_title, p.organisation?.name].filter(Boolean).join(" · ")}</span></span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">last touch {timeAgo(p.last_touch_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming events</CardTitle></CardHeader>
          <CardContent className="p-0">
            {m && m.upcoming.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing scheduled — add the next meetup from Events.</p>
            ) : (
              <ul className="divide-y">
                {m?.upcoming.map((e) => (
                  <li key={e.id} onClick={() => navigate(`/events/${e.id}`)} className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-gray-50">
                    <span className="w-24 shrink-0 text-xs font-medium text-[#008080]">{formatDate(e.starts_at)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.title}</span><span className="block truncate text-xs text-muted-foreground">{[label(e.kind), e.venue].filter(Boolean).join(" · ")}</span></span>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline by stage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {m?.stages.map((s) => (
              <div key={s.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{s.name}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full" style={{ width: `${(s.count / maxStage) * 100}%`, background: s.color }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{s.count} · {formatAUD(s.value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ActivityIcon className="h-4 w-4" /> Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            {m && m.activity.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No activity yet — open any record and log a note, email or meeting.</p>
            ) : (
              <ul className="divide-y">
                {m?.activity.map((a) => (
                  <li key={a.id} onClick={() => a.entity_id && navigate(a.module === "deals" ? `/pipeline?deal=${a.entity_id}` : `/${a.module}/${a.entity_id}`)} className="flex cursor-pointer items-start gap-3 px-6 py-3 hover:bg-gray-50">
                    <StatusBadge status={a.action} className="mt-0.5" />
                    <span className="min-w-0 flex-1 text-sm text-gray-700">{a.summary}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(a.created_at)}{a.profile?.full_name ? ` · ${a.profile.full_name}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
