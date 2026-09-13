import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { timeAgo, daysSince, todayISO } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { DataTable, Column } from "../shared/components/DataTable";
import { StatusBadge } from "../shared/components/StatusBadge";
import { EmptyState } from "../shared/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, Download } from "lucide-react";
import { PersonDialog } from "./PersonDialog";
import { PERSON_TYPES, FOLLOW_UP_DAYS, label } from "../shared/types";
import type { Person } from "../shared/types";

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("*, organisation:organisations(id, name)")
        .order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });
}

function downloadCSV(rows: Person[]) {
  const cols = ["full_name", "type", "status", "email", "phone", "slack_handle", "role_title", "organisation", "tags", "last_touch_at"];
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.join(","), ...rows.map((p) => [p.full_name, p.type, p.status, p.email, p.phone, p.slack_handle, p.role_title, p.organisation?.name, (p.tags ?? []).join("; "), p.last_touch_at].map(q).join(","))];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
  a.download = `mlai-people-${todayISO()}.csv`;
  a.click();
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const { data: people = [], isLoading } = usePeople();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return people.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (status !== "all" && p.status !== status) return false;
      if (!s) return true;
      return [p.full_name, p.email, p.slack_handle, p.role_title, p.organisation?.name, (p.tags ?? []).join(" ")].some((f) => (f || "").toLowerCase().includes(s));
    });
  }, [people, search, type, status]);

  const isStale = (p: Person) => ["sponsor_contact", "partner", "speaker"].includes(p.type) && daysSince(p.last_touch_at) > FOLLOW_UP_DAYS;

  const columns: Column<Person>[] = [
    {
      key: "name", header: "Name",
      render: (p) => (
        <div>
          <div className="font-medium text-gray-900">{p.full_name}</div>
          <div className="text-xs text-muted-foreground">{p.email || p.slack_handle || "—"}</div>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (p) => <StatusBadge status={p.type} /> },
    {
      key: "org", header: "Organisation",
      render: (p) => (
        <div>
          <div className="text-sm">{p.organisation?.name || <span className="text-muted-foreground">—</span>}</div>
          {p.role_title && <div className="text-xs text-muted-foreground">{p.role_title}</div>}
        </div>
      ),
    },
    { key: "slack", header: "Slack", render: (p) => <span className="font-mono text-xs">{p.slack_handle || "—"}</span> },
    {
      key: "tags", header: "Tags",
      render: (p) => (
        <div className="flex flex-wrap gap-1">
          {(p.tags ?? []).map((t) => <Badge key={t} variant="outline" className="text-xs font-normal">{t}</Badge>)}
        </div>
      ),
    },
    {
      key: "touch", header: "Last touch",
      render: (p) => <span className={isStale(p) ? "text-sm font-medium text-amber-600" : "text-sm text-muted-foreground"}>{timeAgo(p.last_touch_at)}</span>,
    },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="People"
        description={`${people.length} in the community · ${people.filter(isStale).length} need a follow-up`}
        actionLabel="Add person"
        onAction={() => setDialogOpen(true)}
        extraActions={
          <Button variant="outline" onClick={() => downloadCSV(filtered)} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, Slack, org, tags…" className="bg-white pl-9" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {PERSON_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
      </div>

      {!isLoading && people.length === 0 ? (
        <EmptyState icon={Users} title="No people yet" description="Members, speakers, sponsor contacts and volunteers all live here." actionLabel="Add person" onAction={() => setDialogOpen(true)} />
      ) : (
        <DataTable columns={columns} data={filtered} loading={isLoading} onRowClick={(p) => navigate(`/people/${p.id}`)} emptyMessage="No one matches those filters" />
      )}

      <PersonDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={(id) => navigate(`/people/${id}`)} />
    </div>
  );
}
