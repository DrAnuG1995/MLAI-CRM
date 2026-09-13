import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDate, timeAgo, formatAUD } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "../shared/components/StatusBadge";
import { ActivityFeed } from "../shared/components/ActivityFeed";
import { ArrowLeft, Pencil, Trash2, Mail, ExternalLink, CalendarDays, Handshake } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { PersonDialog } from "./PersonDialog";
import { useCurrentUser } from "../shared/hooks/useCurrentUser";
import { label } from "../shared/types";
import type { Person, Deal, EventPerson, Event } from "../shared/types";

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const { canWrite } = useCurrentUser();
  const writable = canWrite("people");

  const { data: person, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*, organisation:organisations(id, name)").eq("id", id!).single();
      if (error) throw error;
      return data as Person;
    },
  });

  const { data: deals = [] } = useQuery({
    queryKey: ["deals", "person", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*, stage:pipeline_stages(*)").eq("person_id", id!).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events", "person", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_people").select("*, event:events(id, title, kind, starts_at, status)").eq("person_id", id!);
      if (error) throw error;
      return (data as (EventPerson & { event: Event })[]).sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at));
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("people").delete().eq("id", id!);
      if (error) throw error;
      await logActivity({ module: "people", action: "deleted", summary: `Deleted ${person?.full_name}` });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      toast.success("Deleted");
      navigate("/people");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  if (!person) return <div className="py-20 text-center text-muted-foreground">Person not found.</div>;

  return (
    <div>
      <div className="mb-6 flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/people")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#1F3A6A]">{person.full_name}</h1>
            <StatusBadge status={person.type} />
            <StatusBadge status={person.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[person.role_title, person.organisation?.name].filter(Boolean).join(" · ") || "No role or organisation recorded"}
            {" · "}last touch {timeAgo(person.last_touch_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {person.email && <Button variant="outline" asChild><a href={`mailto:${person.email}`}><Mail className="mr-2 h-4 w-4" /> Email</a></Button>}
          {writable && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>}
          {writable && <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { if (confirm(`Delete ${person.full_name}? This can't be undone.`)) remove.mutate(); }}>
            <Trash2 className="h-4 w-4" />
          </Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">{person.email ? <a className="text-[#1F3A6A] underline-offset-2 hover:underline" href={`mailto:${person.email}`}>{person.email}</a> : "—"}</Field>
                <Field label="Phone">{person.phone || "—"}</Field>
                <Field label="Slack">{person.slack_handle ? <span className="font-mono text-sm">{person.slack_handle}</span> : "—"}</Field>
                <Field label="LinkedIn">{person.linkedin_url ? <a className="inline-flex items-center gap-1 text-[#1F3A6A] hover:underline" href={person.linkedin_url} target="_blank" rel="noopener">Profile <ExternalLink className="h-3 w-3" /></a> : "—"}</Field>
                <Field label="Organisation">{person.organisation ? <Link className="text-[#1F3A6A] hover:underline" to={`/organisations/${person.organisation.id}`}>{person.organisation.name}</Link> : "—"}</Field>
                <Field label="Added">{formatDate(person.created_at)}</Field>
                <Field label="Tags" className="sm:col-span-2">
                  {person.tags?.length ? <div className="flex flex-wrap gap-1">{person.tags.map((t) => <Badge key={t} variant="outline" className="font-normal">{t}</Badge>)}</div> : "—"}
                </Field>
                <Field label="Notes" className="sm:col-span-2"><span className="whitespace-pre-wrap">{person.notes || "—"}</span></Field>
              </dl>
            </CardContent>
          </Card>

          <ActivityFeed module="people" entityId={person.id} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Events</CardTitle>
              <span className="text-xs text-muted-foreground">{events.length}</span>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">Hasn't been to an event yet.</p> : (
                <ul className="divide-y">
                  {events.map((ep) => (
                    <li key={`${ep.event_id}-${ep.role}`} onClick={() => navigate(`/events/${ep.event_id}`)} className="cursor-pointer px-6 py-3 hover:bg-gray-50">
                      <div className="text-sm font-medium">{ep.event.title}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(ep.event.starts_at)} · {label(ep.role)}{ep.rsvp !== "going" ? ` · ${label(ep.rsvp)}` : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><Handshake className="h-4 w-4" /> Deals</CardTitle>
              {canWrite("pipeline") && <Button size="sm" variant="outline" onClick={() => navigate(`/pipeline?new=1&person=${person.id}${person.organisation_id ? `&org=${person.organisation_id}` : ""}`)}>New deal</Button>}
            </CardHeader>
            <CardContent className="p-0">
              {deals.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">No deals attached.</p> : (
                <ul className="divide-y">
                  {deals.map((d) => (
                    <li key={d.id} onClick={() => navigate(`/pipeline?deal=${d.id}`)} className="cursor-pointer px-6 py-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{d.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatAUD(d.value)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: d.stage?.color }} />{d.stage?.name} · {label(d.kind)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <PersonDialog open={editOpen} onOpenChange={setEditOpen} person={person} />
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}
