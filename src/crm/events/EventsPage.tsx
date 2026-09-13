import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDate, todayISO } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { StatusBadge } from "../shared/components/StatusBadge";
import { EmptyState } from "../shared/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, MapPin, Users, Mic2 } from "lucide-react";
import { EventDialog } from "./EventDialog";
import { label } from "../shared/types";
import type { Event } from "../shared/types";

type EventRow = Event & { attendees: number; speakers: number; sponsors: string[] };

export function useEvents() {
  return useQuery({
    queryKey: ["events", "list"],
    queryFn: async () => {
      const [events, people, sponsors] = await Promise.all([
        supabase.from("events").select("*").order("starts_at", { ascending: false }),
        supabase.from("event_people").select("event_id, role, rsvp"),
        supabase.from("event_sponsors").select("event_id, organisation:organisations(name)"),
      ]);
      for (const r of [events, people, sponsors]) if (r.error) throw r.error;
      return (events.data as Event[]).map((e) => ({
        ...e,
        attendees: people.data!.filter((p: any) => p.event_id === e.id && p.role === "attendee" && p.rsvp !== "no_show").length,
        speakers: people.data!.filter((p: any) => p.event_id === e.id && p.role === "speaker").length,
        sponsors: (sponsors.data as any[]).filter((s) => s.event_id === e.id).map((s) => s.organisation?.name).filter(Boolean),
      })) as EventRow[];
    },
  });
}

function EventCard({ e, past, onClick }: { e: EventRow; past: boolean; onClick: () => void }) {
  const d = new Date(e.starts_at);
  return (
    <Card onClick={onClick} className="flex cursor-pointer gap-4 p-4 transition-shadow hover:shadow-md">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-[#1F3A6A]/5 py-2 text-[#1F3A6A]">
        <span className="text-xl font-bold leading-none">{d.toLocaleDateString("en-AU", { day: "numeric", timeZone: "Australia/Melbourne" })}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide">{d.toLocaleDateString("en-AU", { month: "short", timeZone: "Australia/Melbourne" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-medium text-gray-900">{e.title}</div>
          <StatusBadge status={e.status} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{label(e.kind)}</span>
          {e.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.venue}</span>}
          <span>{d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Melbourne" })}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{e.attendees}{e.capacity ? ` / ${e.capacity}` : ""} {past ? "attended" : "going"}</span>
          <span className="inline-flex items-center gap-1"><Mic2 className="h-3 w-3" />{e.speakers} speaker{e.speakers === 1 ? "" : "s"}</span>
          {e.sponsors.length > 0 && <span>Sponsored by {e.sponsors.join(", ")}</span>}
        </div>
      </div>
    </Card>
  );
}

export default function EventsPage() {
  const navigate = useNavigate();
  const { data: events = [], isLoading } = useEvents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const cutoff = `${todayISO()}T00:00:00`;
  const upcoming = events.filter((e) => e.starts_at >= cutoff && e.status !== "cancelled").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => e.starts_at < cutoff || e.status === "cancelled");
  const nextEvent = upcoming[0];

  return (
    <div>
      <PageHeader
        title="Events"
        description={nextEvent ? `Next up: ${nextEvent.title} on ${formatDate(nextEvent.starts_at)}` : "Meetups, workshops, hackathons and socials"}
        actionLabel="Add event"
        onAction={() => setDialogOpen(true)}
      />

      {!isLoading && events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events yet" description="Add the next meetup and start tracking who comes." actionLabel="Add event" onAction={() => setDialogOpen(true)} />
      ) : (
        <Tabs defaultValue="upcoming">
          <TabsList className="mb-4 bg-white">
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming">
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled.</p> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{upcoming.map((e) => <EventCard key={e.id} e={e} past={false} onClick={() => navigate(`/events/${e.id}`)} />)}</div>
            )}
          </TabsContent>
          <TabsContent value="past">
            {past.length === 0 ? <p className="text-sm text-muted-foreground">No past events recorded.</p> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} past onClick={() => navigate(`/events/${e.id}`)} />)}</div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <EventDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={(id) => navigate(`/events/${id}`)} />
    </div>
  );
}
