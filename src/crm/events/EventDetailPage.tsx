import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDateTime, todayISO } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "../shared/components/StatusBadge";
import { ActivityFeed } from "../shared/components/ActivityFeed";
import { ArrowLeft, Pencil, Trash2, MapPin, Users, Mic2, Building2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { EventDialog } from "./EventDialog";
import { PersonDialog } from "../people/PersonDialog";
import { useCurrentUser } from "../shared/hooks/useCurrentUser";
import { label } from "../shared/types";
import type { Event, EventPerson, Person, Organisation } from "../shared/types";

const ADD = "__add__";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { canWrite } = useCurrentUser();
  const writable = canWrite("events");

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: async () => { const { data, error } = await supabase.from("events").select("*, host:organisations(id, name)").eq("id", id!).single(); if (error) throw error; return data as Event & { host: Pick<Organisation, "id" | "name"> | null }; },
  });
  const { data: links = [] } = useQuery({
    queryKey: ["event-people", id],
    queryFn: async () => { const { data, error } = await supabase.from("event_people").select("*, person:people(id, full_name, email, organisation_id, organisation:organisations(name))").eq("event_id", id!); if (error) throw error; return data as EventPerson[]; },
  });
  const { data: sponsors = [] } = useQuery({
    queryKey: ["event-sponsors", id],
    queryFn: async () => { const { data, error } = await supabase.from("event_sponsors").select("organisation:organisations(id, name, tier)").eq("event_id", id!); if (error) throw error; return (data as unknown as { organisation: Pick<Organisation, "id" | "name" | "tier"> }[]).map((r) => r.organisation); },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["people", "names-with-org"],
    queryFn: async () => { const { data, error } = await supabase.from("people").select("id, full_name, email, type, organisation:organisations(name)").eq("status", "active").order("full_name"); if (error) throw error; return data as unknown as (Pick<Person, "id" | "full_name" | "email" | "type"> & { organisation: { name: string } | null })[]; },
  });
  const { data: orgs = [] } = useQuery({
    queryKey: ["organisations", "names"],
    queryFn: async () => { const { data, error } = await supabase.from("organisations").select("id, name").order("name"); if (error) throw error; return data as Pick<Organisation, "id" | "name">[]; },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["event-people", id] });
    queryClient.invalidateQueries({ queryKey: ["event-sponsors", id] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
    queryClient.invalidateQueries({ queryKey: ["people"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
  };

  const past = !!event && event.starts_at < `${todayISO()}T00:00:00`;
  const attendees = useMemo(() => links.filter((l) => l.role === "attendee"), [links]);
  const speakers = useMemo(() => links.filter((l) => l.role === "speaker"), [links]);
  const attendeeIds = new Set(attendees.map((a) => a.person_id));
  const speakerIds = new Set(speakers.map((s) => s.person_id));

  const setAttendance = useMutation({
    mutationFn: async ({ personId, on, name }: { personId: string; on: boolean; name: string }) => {
      if (on) {
        const { error } = await supabase.from("event_people").upsert({ event_id: id!, person_id: personId, role: "attendee", rsvp: past ? "attended" : "going" });
        if (error) throw error;
        // Coming to an event is a touch — keeps the follow-up list honest.
        await logActivity({ module: "people", entityId: personId, action: "event", summary: `${past ? "Attended" : "RSVP'd to"} ${event?.title}` });
      } else {
        const { error } = await supabase.from("event_people").delete().match({ event_id: id!, person_id: personId, role: "attendee" });
        if (error) throw error;
      }
      return name;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const setRsvp = useMutation({
    mutationFn: async ({ personId, rsvp }: { personId: string; rsvp: string }) => {
      const { error } = await supabase.from("event_people").update({ rsvp }).match({ event_id: id!, person_id: personId, role: "attendee" });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addSpeaker = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase.from("event_people").upsert({ event_id: id!, person_id: personId, role: "speaker", rsvp: past ? "attended" : "going" });
      if (error) throw error;
      const name = people.find((p) => p.id === personId)?.full_name;
      await logActivity({ module: "events", entityId: id!, action: "speaker", summary: `Added ${name} as a speaker` });
      await logActivity({ module: "people", entityId: personId, action: "speaker", summary: `Speaking at ${event?.title}` });
    },
    onSuccess: () => { invalidate(); toast.success("Speaker added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeSpeaker = useMutation({
    mutationFn: async (personId: string) => { const { error } = await supabase.from("event_people").delete().match({ event_id: id!, person_id: personId, role: "speaker" }); if (error) throw error; },
    onSuccess: invalidate,
  });
  const addSponsor = useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase.from("event_sponsors").upsert({ event_id: id!, organisation_id: orgId });
      if (error) throw error;
      await logActivity({ module: "organisations", entityId: orgId, action: "sponsored", summary: `Sponsoring ${event?.title}` });
    },
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["organisations"] }); toast.success("Sponsor added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeSponsor = useMutation({
    mutationFn: async (orgId: string) => { const { error } = await supabase.from("event_sponsors").delete().match({ event_id: id!, organisation_id: orgId }); if (error) throw error; },
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["organisations"] }); },
  });
  const remove = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("events").delete().eq("id", id!); if (error) throw error; await logActivity({ module: "events", action: "deleted", summary: `Deleted ${event?.title}` }); },
    onSuccess: () => { invalidate(); toast.success("Deleted"); navigate("/events"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  if (!event) return <div className="py-20 text-center text-muted-foreground">Event not found.</div>;

  const s = search.trim().toLowerCase();
  const roster = people
    .filter((p) => !s || `${p.full_name} ${p.email ?? ""} ${p.organisation?.name ?? ""}`.toLowerCase().includes(s))
    .sort((a, b) => Number(attendeeIds.has(b.id)) - Number(attendeeIds.has(a.id)))
    .slice(0, s ? 50 : 200);
  const attended = attendees.filter((a) => a.rsvp !== "no_show").length;

  return (
    <div>
      <div className="mb-6 flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/events")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#008080]">{event.title}</h1>
            <StatusBadge status={event.status} />
            <Badge variant="outline">{label(event.kind)}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span>{formatDateTime(event.starts_at)}</span>
            {event.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.venue}</span>}
            {event.host && <button className="inline-flex items-center gap-1 hover:underline" onClick={() => navigate(`/organisations/${event.host!.id}`)}><Building2 className="h-3.5 w-3.5" />Hosted by {event.host.name}</button>}
          </p>
        </div>
        <div className="flex gap-2">
          {writable && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>}
          {writable && <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { if (confirm(`Delete ${event.title}? Attendance records go with it.`)) remove.mutate(); }}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> {past ? "Attendance" : "RSVPs"}</CardTitle>
              <span className="text-sm font-semibold tabular-nums text-[#008080]">{attended}{event.capacity ? ` / ${event.capacity}` : ""}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people to tick off…" className="pl-9" />
                </div>
                {writable && canWrite("people") && <Button variant="outline" onClick={() => setPersonOpen(true)}>New person</Button>}
              </div>
              <div className="max-h-[420px] divide-y overflow-y-auto rounded-md border">
                {roster.length === 0 && <p className="p-4 text-sm text-muted-foreground">No one matches.</p>}
                {roster.map((p) => {
                  const on = attendeeIds.has(p.id);
                  const link = attendees.find((a) => a.person_id === p.id);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={on} disabled={!writable} onChange={(e) => setAttendance.mutate({ personId: p.id, on: e.target.checked, name: p.full_name })} className="h-4 w-4 rounded border-gray-300 text-[#008080] focus:ring-[#008080]" />
                      <span className="min-w-0 flex-1 truncate">{p.full_name}<span className="ml-2 text-xs text-muted-foreground">{p.organisation?.name || label(p.type)}</span></span>
                      {on && past && (
                        <Select value={link?.rsvp ?? "attended"} onValueChange={(v) => setRsvp.mutate({ personId: p.id, rsvp: v })}>
                          <SelectTrigger className="h-7 w-28 text-xs" onClick={(e) => e.preventDefault()}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="attended">Attended</SelectItem><SelectItem value="no_show">No-show</SelectItem><SelectItem value="going">RSVP'd</SelectItem></SelectContent>
                        </Select>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Ticking someone logs a touch against them, so sponsor and speaker contacts who show up don't land on the follow-up list.</p>
            </CardContent>
          </Card>

          <ActivityFeed module="events" entityId={event.id} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mic2 className="h-4 w-4" /> Speakers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {speakers.length === 0 ? <p className="text-sm text-muted-foreground">No speakers yet.</p> : (
                <ul className="space-y-1">
                  {speakers.map((sp) => (
                    <li key={sp.person_id} className="flex items-center gap-2 text-sm">
                      <button className="flex-1 truncate text-left text-[#008080] hover:underline" onClick={() => navigate(`/people/${sp.person_id}`)}>{sp.person?.full_name}</button>
                      <button onClick={() => removeSpeaker.mutate(sp.person_id)} className="text-gray-400 hover:text-red-600" aria-label="Remove"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <Select value={ADD} disabled={!writable} onValueChange={(v) => v !== ADD && addSpeaker.mutate(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ADD}>Add a speaker…</SelectItem>
                  {people.filter((p) => !speakerIds.has(p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}{p.organisation ? ` · ${p.organisation.name}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Sponsors</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {sponsors.length === 0 ? <p className="text-sm text-muted-foreground">No sponsors attached.</p> : (
                <ul className="space-y-1">
                  {sponsors.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 text-sm">
                      <button className="flex-1 truncate text-left text-[#008080] hover:underline" onClick={() => navigate(`/organisations/${o.id}`)}>{o.name}</button>
                      {o.tier && <StatusBadge status={o.tier} />}
                      <button onClick={() => removeSponsor.mutate(o.id)} className="text-gray-400 hover:text-red-600" aria-label="Remove"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <Select value={ADD} disabled={!writable} onValueChange={(v) => v !== ADD && addSponsor.mutate(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ADD}>Add a sponsor…</SelectItem>
                  {orgs.filter((o) => !sponsors.some((s) => s.id === o.id)).map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {event.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent><p className="whitespace-pre-wrap text-sm text-gray-700">{event.notes}</p></CardContent>
            </Card>
          )}
        </div>
      </div>

      <EventDialog open={editOpen} onOpenChange={setEditOpen} event={event} />
      <PersonDialog open={personOpen} onOpenChange={setPersonOpen} onSaved={(pid) => setAttendance.mutate({ personId: pid, on: true, name: "" })} />
    </div>
  );
}
