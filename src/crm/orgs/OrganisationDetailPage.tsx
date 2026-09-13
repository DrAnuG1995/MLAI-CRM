import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDate, formatAUD } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "../shared/components/StatusBadge";
import { ActivityFeed } from "../shared/components/ActivityFeed";
import { ArrowLeft, Pencil, Trash2, ExternalLink, Users, Handshake, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { OrganisationDialog } from "./OrganisationDialog";
import { PersonDialog } from "../people/PersonDialog";
import { useCurrentUser } from "../shared/hooks/useCurrentUser";
import { label } from "../shared/types";
import type { Organisation, Person, Deal, Event } from "../shared/types";

export default function OrganisationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [personOpen, setPersonOpen] = useState(false);
  const { canWrite } = useCurrentUser();
  const writable = canWrite("organisations");

  const { data: org, isLoading } = useQuery({
    queryKey: ["organisation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("organisations").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Organisation;
    },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["people", "org", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*").eq("organisation_id", id!).order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });
  const { data: deals = [] } = useQuery({
    queryKey: ["deals", "org", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*, stage:pipeline_stages(*)").eq("organisation_id", id!).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });
  const { data: events = [] } = useQuery({
    queryKey: ["events", "org", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_sponsors").select("event:events(id, title, kind, starts_at, status)").eq("organisation_id", id!);
      if (error) throw error;
      return (data as unknown as { event: Event }[]).map((r) => r.event).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("organisations").delete().eq("id", id!);
      if (error) throw error;
      await logActivity({ module: "organisations", action: "deleted", summary: `Deleted ${org?.name}` });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["organisations"] }); toast.success("Deleted"); navigate("/organisations"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  if (!org) return <div className="py-20 text-center text-muted-foreground">Organisation not found.</div>;

  const won = deals.filter((d) => d.stage?.is_won).reduce((a, d) => a + Number(d.value || 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/organisations")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#008080]">{org.name}</h1>
            <StatusBadge status={org.kind} className="bg-gray-100 text-gray-800 border-gray-200" />
            {org.tier && <StatusBadge status={org.tier} />}
            <StatusBadge status={org.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[org.location, won ? `${formatAUD(won)} won to date` : null].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {org.website && <Button variant="outline" asChild><a href={org.website} target="_blank" rel="noopener"><ExternalLink className="mr-2 h-4 w-4" /> Website</a></Button>}
          {writable && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>}
          {writable && <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { if (confirm(`Delete ${org.name}? People stay but lose the link; deals lose the link too.`)) remove.mutate(); }}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> People</CardTitle>
              {canWrite("people") && <Button size="sm" variant="outline" onClick={() => setPersonOpen(true)}>Add person</Button>}
            </CardHeader>
            <CardContent className="p-0">
              {people.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">No contacts here yet.</p> : (
                <ul className="divide-y">
                  {people.map((p) => (
                    <li key={p.id} onClick={() => navigate(`/people/${p.id}`)} className="flex cursor-pointer items-center gap-3 px-6 py-3 hover:bg-gray-50">
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{p.full_name}</span><span className="block truncate text-xs text-muted-foreground">{[p.role_title, p.email].filter(Boolean).join(" · ")}</span></span>
                      <StatusBadge status={p.type} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm text-gray-700">{org.notes || <span className="text-muted-foreground">Nothing yet — added {formatDate(org.created_at)}.</span>}</p></CardContent>
          </Card>

          <ActivityFeed module="organisations" entityId={org.id} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><Handshake className="h-4 w-4" /> Deals</CardTitle>
              {canWrite("pipeline") && <Button size="sm" variant="outline" onClick={() => navigate(`/pipeline?new=1&org=${org.id}`)}>New deal</Button>}
            </CardHeader>
            <CardContent className="p-0">
              {deals.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">No deals yet.</p> : (
                <ul className="divide-y">
                  {deals.map((d) => (
                    <li key={d.id} onClick={() => navigate(`/pipeline?deal=${d.id}`)} className="cursor-pointer px-6 py-3 hover:bg-gray-50">
                      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{d.name}</span><span className="text-xs tabular-nums text-muted-foreground">{formatAUD(d.value)}</span></div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full" style={{ background: d.stage?.color }} />{d.stage?.name} · {label(d.kind)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Events sponsored</CardTitle>
              <span className="text-xs text-muted-foreground">{events.length}</span>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? <p className="px-6 pb-6 text-sm text-muted-foreground">None yet.</p> : (
                <ul className="divide-y">
                  {events.map((e) => (
                    <li key={e.id} onClick={() => navigate(`/events/${e.id}`)} className="cursor-pointer px-6 py-3 hover:bg-gray-50">
                      <div className="text-sm font-medium">{e.title}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(e.starts_at)} · {label(e.kind)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <OrganisationDialog open={editOpen} onOpenChange={setEditOpen} org={org} />
      <PersonDialog open={personOpen} onOpenChange={setPersonOpen} defaults={{ organisation_id: org.id, type: org.kind === "sponsor" ? "sponsor_contact" : org.kind === "partner" ? "partner" : "member" }} onSaved={() => queryClient.invalidateQueries({ queryKey: ["people", "org", id] })} />
    </div>
  );
}
