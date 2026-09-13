import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { StatusBadge } from "../shared/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Link2, UserPlus, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { useCurrentUser } from "../shared/hooks/useCurrentUser";
import { ALL_QUESTIONS, OFFERS } from "../shared/memberForm";
import type { Person } from "../shared/types";

interface Submission {
  id: string; source: string; first_name: string; last_name: string; email: string; phone: string | null; slack_handle: string | null;
  answers: Record<string, unknown>; matched_person_id: string | null; reviewed_at: string | null; created_at: string;
  person?: Pick<Person, "id" | "full_name"> | null;
}

const OFFER_TO_KEY: Record<string, string> = {
  [OFFERS[0]]: "mentor", [OFFERS[1]]: "volunteer", [OFFERS[2]]: "speaker", [OFFERS[3]]: "sponsor", [OFFERS[4]]: "venue", [OFFERS[5]]: "writer",
};
const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/^@/, "");

/** What a submission writes onto a person record (new or existing). */
function personPatch(s: Submission) {
  const a = s.answers;
  const offers = ((a.offers as string[]) || []).map((o) => OFFER_TO_KEY[o]).filter(Boolean);
  const tags = new Set<string>(["form-" + s.source]);
  if (a.hiring === true) tags.add("hiring");
  if (a.open_to_work === true) tags.add("open-to-work");
  for (const o of offers) tags.add(o);
  let type: Person["type"] = "member";
  if (offers.includes("speaker")) type = "speaker";
  if (offers.includes("volunteer")) type = "volunteer";
  return {
    full_name: `${s.first_name} ${s.last_name}`.trim(),
    email: s.email,
    phone: s.phone,
    slack_handle: s.slack_handle,
    linkedin_url: (a.linkedin as string) || null,
    role_title: (a.role_title as string) || null,
    location: (a.location as string) || null,
    interests: (a.interests as string[]) || [],
    offers,
    ai_level: (a.ai_level as string) || null,
    startup_status: (a.startup_status as string) || null,
    startup_name: (a.startup_name as string) || null,
    type,
    tags: [...tags],
    last_touch_at: s.created_at,
  };
}

export default function SubmissionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canWrite } = useCurrentUser();
  const writable = canWrite("people");
  const [tab, setTab] = useState<"new" | "done">("new");
  const [open, setOpen] = useState<Submission | null>(null);
  const [linkTo, setLinkTo] = useState<string>("");

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["submissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("member_submissions").select("*, person:people(id, full_name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Submission[];
    },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["people", "match-index"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("id, full_name, email, slack_handle");
      if (error) throw error;
      return data as Pick<Person, "id" | "full_name" | "email" | "slack_handle">[];
    },
  });

  // Best guess at the existing record: email, then Slack name, then full name.
  const suggest = (s: Submission) => {
    const e = norm(s.email), h = norm(s.slack_handle), n = norm(`${s.first_name} ${s.last_name}`);
    return people.find((p) => e && norm(p.email) === e)
      || people.find((p) => h && (norm(p.slack_handle) === h || norm(p.full_name) === h))
      || people.find((p) => norm(p.full_name) === n)
      || null;
  };

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["submissions"] }); queryClient.invalidateQueries({ queryKey: ["people"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }); };

  const apply = useMutation({
    mutationFn: async ({ s, personId }: { s: Submission; personId: string | null }) => {
      const patch = personPatch(s);
      let id = personId;
      if (id) {
        // Merge: never blank out something we already know.
        const { data: cur } = await supabase.from("people").select("*").eq("id", id).single();
        const merged: Record<string, unknown> = { ...patch };
        for (const k of ["email", "phone", "slack_handle", "linkedin_url", "role_title", "location", "ai_level", "startup_status", "startup_name"]) if (!(patch as any)[k] && cur?.[k]) merged[k] = cur[k];
        merged.tags = [...new Set([...(cur?.tags || []), ...patch.tags])];
        if (cur?.type === "organiser" || cur?.type === "sponsor_contact" || cur?.type === "partner") merged.type = cur.type;
        const { error } = await supabase.from("people").update(merged).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("people").insert({ ...patch, status: "active", notes: `Joined via the ${s.source} form` }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const { error } = await supabase.from("member_submissions").update({ matched_person_id: id, reviewed_at: new Date().toISOString() }).eq("id", s.id);
      if (error) throw error;
      await logActivity({ module: "people", entityId: id!, action: "form", summary: `Filled in the ${s.source} member form${personId ? " (merged into existing record)" : ""}` });
      return id!;
    },
    onSuccess: (id, { personId }) => { invalidate(); toast.success(personId ? "Merged into existing person" : "Person created"); setOpen(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => subs.filter((s) => (tab === "new" ? !s.reviewed_at : !!s.reviewed_at)), [subs, tab]);
  const formUrl = `${window.location.origin}${window.location.pathname}#/join?src=`;

  if (open) {
    const a = open.answers;
    const suggestion = suggest(open);
    const target = linkTo || suggestion?.id || "";
    return (
      <div>
        <div className="mb-6 flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setOpen(null); setLinkTo(""); }}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[#008080]">{open.first_name} {open.last_name}</h1>
              <Badge variant="outline">{open.source}</Badge>
              {open.reviewed_at && <StatusBadge status="done" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{open.email}{open.phone ? ` · ${open.phone}` : ""} · submitted {formatDateTime(open.created_at)}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="pt-6">
              <dl className="grid gap-4 sm:grid-cols-2">
                {ALL_QUESTIONS.filter((q) => !["first_name", "last_name", "email", "phone"].includes(q.id)).map((q) => {
                  const v = q.id === "slack_handle" ? open.slack_handle : a[q.id];
                  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null;
                  return (
                    <div key={q.id} className={q.type === "textarea" || q.type === "multi" ? "sm:col-span-2" : ""}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{q.label}</dt>
                      <dd className="mt-1 text-sm">
                        {Array.isArray(v) ? <div className="flex flex-wrap gap-1">{v.map((x) => <Badge key={String(x)} variant="outline" className="font-normal">{String(x)}</Badge>)}</div>
                          : typeof v === "boolean" ? (v ? "Yes" : "No")
                          : q.type === "url" ? <a className="inline-flex items-center gap-1 text-[#008080] hover:underline" href={String(v)} target="_blank" rel="noopener">{String(v)} <ExternalLink className="h-3 w-3" /></a>
                          : <span className="whitespace-pre-wrap">{String(v)}</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-6">
              {open.reviewed_at && open.person ? (
                <>
                  <p className="text-sm">Linked to <button className="font-medium text-[#008080] hover:underline" onClick={() => navigate(`/people/${open.person!.id}`)}>{open.person.full_name}</button>.</p>
                  <Button variant="outline" className="w-full" onClick={() => navigate(`/people/${open.person!.id}`)}>Open person</Button>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium">Add to People</p>
                    <p className="text-xs text-muted-foreground">{suggestion ? <>Looks like <strong>{suggestion.full_name}</strong> is already in the CRM — merging fills in what we didn't know.</> : "No existing record matches this email or Slack name."}</p>
                  </div>
                  <Select value={target || "__new__"} onValueChange={(v) => setLinkTo(v === "__new__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">Create a new person</SelectItem>
                      {suggestion && <SelectItem value={suggestion.id}>Merge into {suggestion.full_name} (suggested)</SelectItem>}
                      {people.filter((p) => p.id !== suggestion?.id).sort((x, y) => x.full_name.localeCompare(y.full_name)).slice(0, 2000).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}{p.slack_handle ? ` · ${p.slack_handle}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button disabled={!writable || apply.isPending} className="w-full bg-[#008080] hover:bg-[#008080]/90" onClick={() => apply.mutate({ s: open, personId: target || null })}>
                    {target ? <><Link2 className="mr-2 h-4 w-4" /> Merge into existing</> : <><UserPlus className="mr-2 h-4 w-4" /> Create person</>}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Form responses"
        description={`${subs.filter((s) => !s.reviewed_at).length} to review · ${subs.length} total`}
        extraActions={
          <>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(formUrl + "slack"); toast.success("Slack form link copied"); }}><Copy className="mr-2 h-4 w-4" /> Slack link</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(formUrl + "substack"); toast.success("Substack form link copied"); }}><Copy className="mr-2 h-4 w-4" /> Substack link</Button>
            <Button variant="outline" onClick={() => navigate("/people")}>People</Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "done")}>
        <TabsList className="mb-4 bg-white">
          <TabsTrigger value="new">To review ({subs.filter((s) => !s.reviewed_at).length})</TabsTrigger>
          <TabsTrigger value="done">Linked ({subs.filter((s) => !!s.reviewed_at).length})</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? <div className="py-20 text-center text-muted-foreground">Loading…</div>
        : list.length === 0 ? <div className="rounded-lg border border-dashed bg-white py-16 text-center text-sm text-muted-foreground">{tab === "new" ? "Nothing waiting. Share the form link and responses will land here." : "No linked responses yet."}</div>
        : (
          <div className="rounded-lg border bg-white">
            <ul className="divide-y">
              {list.map((s) => {
                const sug = suggest(s);
                const offers = (s.answers.offers as string[]) || [];
                return (
                  <li key={s.id} onClick={() => { setOpen(s); setLinkTo(""); }} className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.first_name} {s.last_name}</span>
                        <Badge variant="outline" className="text-xs">{s.source}</Badge>
                        {sug && !s.reviewed_at && <span className="text-xs text-muted-foreground">matches {sug.full_name}</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{[s.email, s.answers.role_title, s.answers.organisation, s.answers.location].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="hidden flex-wrap justify-end gap-1 sm:flex">{offers.map((o) => <Badge key={o} variant="outline" className="text-xs font-normal">{o.split(" ")[0]}</Badge>)}</div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(s.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
    </div>
  );
}
