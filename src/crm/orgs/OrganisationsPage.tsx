import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatAUD } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { DataTable, Column } from "../shared/components/DataTable";
import { StatusBadge } from "../shared/components/StatusBadge";
import { EmptyState } from "../shared/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Search } from "lucide-react";
import { OrganisationDialog } from "./OrganisationDialog";
import { useCurrentUser } from "../shared/hooks/useCurrentUser";
import { ORG_KINDS, label } from "../shared/types";
import type { Organisation, Deal, PipelineStage } from "../shared/types";

type OrgRow = Organisation & { people: number; openDeals: number; openValue: number; eventsSponsored: number };

export default function OrganisationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { canWrite } = useCurrentUser();
  const writable = canWrite("organisations");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["organisations", "with-counts"],
    queryFn: async () => {
      const [orgs, people, deals, stages, sponsors] = await Promise.all([
        supabase.from("organisations").select("*").order("name"),
        supabase.from("people").select("organisation_id"),
        supabase.from("deals").select("organisation_id, stage_id, value"),
        supabase.from("pipeline_stages").select("id, is_closed"),
        supabase.from("event_sponsors").select("organisation_id"),
      ]);
      for (const r of [orgs, people, deals, stages, sponsors]) if (r.error) throw r.error;
      const openStages = new Set((stages.data as PipelineStage[]).filter((s) => !s.is_closed).map((s) => s.id));
      return (orgs.data as Organisation[]).map((o) => {
        const od = (deals.data as Deal[]).filter((d) => d.organisation_id === o.id && openStages.has(d.stage_id));
        return {
          ...o,
          people: people.data!.filter((p: any) => p.organisation_id === o.id).length,
          openDeals: od.length,
          openValue: od.reduce((a, d) => a + Number(d.value || 0), 0),
          eventsSponsored: sponsors.data!.filter((s: any) => s.organisation_id === o.id).length,
        } as OrgRow;
      });
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((o) => (kind === "all" || o.kind === kind) && (!s || [o.name, o.location, o.website, o.tier].some((f) => (f || "").toLowerCase().includes(s))));
  }, [rows, search, kind]);

  const columns: Column<OrgRow>[] = [
    {
      key: "name", header: "Organisation",
      render: (o) => (
        <div>
          <div className="font-medium text-gray-900">{o.name}</div>
          <div className="text-xs text-muted-foreground">{[o.location, o.website?.replace(/^https?:\/\/(www\.)?/, "")].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      ),
    },
    { key: "kind", header: "Kind", render: (o) => <StatusBadge status={o.kind} className="bg-gray-100 text-gray-800 border-gray-200" /> },
    { key: "tier", header: "Tier", render: (o) => (o.tier ? <StatusBadge status={o.tier} /> : <span className="text-muted-foreground">—</span>) },
    { key: "status", header: "Status", render: (o) => <StatusBadge status={o.status} /> },
    { key: "people", header: "People", className: "text-right", render: (o) => <span className="tabular-nums">{o.people}</span> },
    { key: "deals", header: "Open deals", className: "text-right", render: (o) => (o.openDeals ? <span className="tabular-nums">{o.openDeals} · {formatAUD(o.openValue)}</span> : <span className="text-muted-foreground">—</span>) },
    { key: "events", header: "Events sponsored", className: "text-right", render: (o) => <span className="tabular-nums">{o.eventsSponsored || <span className="text-muted-foreground">—</span>}</span> },
  ];

  return (
    <div>
      <PageHeader title="Organisations" description="Sponsors, partners, venues and universities" actionLabel={writable ? "Add organisation" : undefined} onAction={writable ? () => setDialogOpen(true) : undefined} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organisations…" className="bg-white pl-9" />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {ORG_KINDS.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
      </div>

      {!isLoading && rows.length === 0 ? (
        <EmptyState icon={Building2} title="No organisations yet" description="Add the companies that sponsor, host or partner with MLAI." actionLabel={writable ? "Add organisation" : undefined} onAction={writable ? () => setDialogOpen(true) : undefined} />
      ) : (
        <DataTable columns={columns} data={filtered} loading={isLoading} onRowClick={(o) => navigate(`/organisations/${o.id}`)} emptyMessage="No organisations match" />
      )}

      <OrganisationDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={(id) => navigate(`/organisations/${id}`)} />
    </div>
  );
}
