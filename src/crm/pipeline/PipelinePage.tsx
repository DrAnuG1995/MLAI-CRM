import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { formatAUD, formatDate, todayISO, timeAgo } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { StatusBadge } from "../shared/components/StatusBadge";
import { ActivityFeed } from "../shared/components/ActivityFeed";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GripVertical, Search, Pencil, Trash2, ExternalLink, User, Building2 } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { DealDialog } from "./DealDialog";
import { useCurrentUser } from "../shared/hooks/useCurrentUser";
import { label } from "../shared/types";
import type { Deal, PipelineStage } from "../shared/types";

function usePipeline() {
  const stages = useQuery({
    queryKey: ["pipeline-stages"],
    staleTime: 5 * 60_000,
    queryFn: async () => { const { data, error } = await supabase.from("pipeline_stages").select("*").order("position"); if (error) throw error; return data as PipelineStage[]; },
  });
  const deals = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals")
        .select("*, organisation:organisations(id, name), person:people(id, full_name), owner:profiles(id, full_name, email)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });
  return { stages: stages.data ?? [], deals: deals.data ?? [], isLoading: stages.isLoading || deals.isLoading };
}

function DealCard({ deal, dragging, onOpen }: { deal: Deal; dragging?: boolean; onOpen?: () => void }) {
  const overdue = deal.due_date && deal.due_date < todayISO();
  return (
    <div onClick={onOpen} className={`rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${dragging ? "opacity-50" : ""} ${onOpen ? "cursor-pointer" : ""}`}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">{deal.name}</div>
          <div className="truncate text-xs text-muted-foreground">{[deal.organisation?.name, deal.person?.full_name].filter(Boolean).join(" · ") || label(deal.kind)}</div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-semibold tabular-nums text-[#008080]">{deal.value ? formatAUD(deal.value) : ""}</span>
            <span className="text-muted-foreground">{deal.owner?.full_name?.split(" ")[0] || ""}</span>
          </div>
          {(deal.next_step || deal.due_date) && (
            <div className={`mt-2 border-t border-dashed pt-2 text-xs ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
              {deal.next_step || "Due"}{deal.due_date ? ` · ${formatDate(deal.due_date)}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableDeal({ deal, onOpen, disabled }: { deal: Deal; onOpen: () => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="touch-none">
      <DealCard deal={deal} dragging={isDragging} onOpen={onOpen} />
    </div>
  );
}

function StageColumn({ stage, deals, onOpen, readOnly }: { stage: PipelineStage; deals: Deal[]; onOpen: (d: Deal) => void; readOnly?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((a, d) => a + Number(d.value || 0), 0);
  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-lg border bg-gray-100/70 transition-colors ${isOver ? "border-[#008080] bg-[#008080]/5" : ""}`}>
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
        <span className="text-sm font-semibold text-gray-800">{stage.name}</span>
        <span className="text-xs text-muted-foreground">{deals.length}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatAUD(total)}</span>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
        {deals.map((d) => <DraggableDeal key={d.id} deal={d} onOpen={() => onOpen(d)} disabled={readOnly} />)}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { stages, deals, isLoading } = usePipeline();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [dialogOpen, setDialogOpen] = useState(params.get("new") === "1");
  const { canWrite } = useCurrentUser();
  const writable = canWrite("pipeline");
  const newDefaults = useMemo(() => ({ organisation_id: params.get("org") ?? undefined, person_id: params.get("person") ?? undefined }), [params]);

  const openDealId = params.get("deal");
  const openDeal = deals.find((d) => d.id === openDealId) ?? null;
  const setOpenDeal = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set("deal", id); else p.delete("deal"); p.delete("new"); p.delete("org"); p.delete("person"); setParams(p, { replace: true }); };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } })
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return deals.filter((d) => (kind === "all" || d.kind === kind) && (!s || [d.name, d.organisation?.name, d.person?.full_name, d.owner?.full_name].some((f) => (f || "").toLowerCase().includes(s))));
  }, [deals, search, kind]);

  const move = useMutation({
    mutationFn: async ({ deal, stage }: { deal: Deal; stage: PipelineStage }) => {
      const { error } = await supabase.from("deals").update({ stage_id: stage.id }).eq("id", deal.id);
      if (error) throw error;
      const from = stages.find((s) => s.id === deal.stage_id)?.name;
      await logActivity({ module: "deals", entityId: deal.id, action: "stage", summary: `${deal.name}: ${from} → ${stage.name}`, metadata: { from: deal.stage_id, to: stage.id } });
      if (deal.person_id) await logActivity({ module: "people", entityId: deal.person_id, action: "stage", summary: `${deal.name} moved to ${stage.name}` });
    },
    onMutate: async ({ deal, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["deals"] });
      const prev = queryClient.getQueryData<Deal[]>(["deals"]);
      queryClient.setQueryData<Deal[]>(["deals"], (old) => old?.map((d) => (d.id === deal.id ? { ...d, stage_id: stage.id } : d)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => { queryClient.setQueryData(["deals"], ctx?.prev); toast.error(e.message); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["deals"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }); queryClient.invalidateQueries({ queryKey: ["activity"] }); },
  });

  const remove = useMutation({
    mutationFn: async (deal: Deal) => {
      const { error } = await supabase.from("deals").delete().eq("id", deal.id);
      if (error) throw error;
      await logActivity({ module: "deals", action: "deleted", summary: `Deleted ${deal.name}` });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deals"] }); queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }); setOpenDeal(null); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const deal = deals.find((d) => d.id === e.active.id);
    const stage = stages.find((s) => s.id === e.over?.id);
    if (deal && stage && deal.stage_id !== stage.id) move.mutate({ deal, stage });
  };

  const active = activeId ? deals.find((d) => d.id === activeId) : null;
  const open = deals.filter((d) => !stages.find((s) => s.id === d.stage_id)?.is_closed);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pipeline"
        description={`${open.length} open · ${formatAUD(open.reduce((a, d) => a + Number(d.value || 0), 0))} in play`}
        actionLabel={writable ? "New deal" : undefined}
        onAction={writable ? () => { setEditing(null); setDialogOpen(true); } : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deals, orgs, owners…" className="bg-white pl-9" />
        </div>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {["sponsorship", "partnership", "venue", "grant", "speaker"].map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground">Loading…</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
            {stages.map((s) => <StageColumn key={s.id} stage={s} deals={filtered.filter((d) => d.stage_id === s.id)} onOpen={(d) => setOpenDeal(d.id)} readOnly={!writable} />)}
          </div>
          <DragOverlay>{active ? <div className="w-72"><DealCard deal={active} /></div> : null}</DragOverlay>
        </DndContext>
      )}

      <Sheet open={!!openDeal} onOpenChange={(o) => !o && setOpenDeal(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {openDeal && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 pr-6">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stages.find((s) => s.id === openDeal.stage_id)?.color }} />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stages.find((s) => s.id === openDeal.stage_id)?.name} · {label(openDeal.kind)}</span>
                </div>
                <SheetTitle className="text-xl text-[#008080]">{openDeal.name}</SheetTitle>
              </SheetHeader>

              <div className="mt-4 flex flex-wrap gap-2">
                <Select value={openDeal.stage_id} disabled={!writable} onValueChange={(v) => { const stage = stages.find((s) => s.id === v); if (stage) move.mutate({ deal: openDeal, stage }); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {writable && <Button variant="outline" onClick={() => { setEditing(openDeal); setDialogOpen(true); }}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>}
                {openDeal.linear_url && <Button variant="outline" asChild><a href={openDeal.linear_url} target="_blank" rel="noopener"><ExternalLink className="mr-2 h-4 w-4" /> Linear</a></Button>}
                {writable && <Button variant="outline" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { if (confirm(`Delete ${openDeal.name}?`)) remove.mutate(openDeal); }}><Trash2 className="h-4 w-4" /></Button>}
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Value</dt><dd className="mt-1 font-semibold tabular-nums text-[#008080]">{formatAUD(openDeal.value)}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Owner</dt><dd className="mt-1">{openDeal.owner?.full_name || openDeal.owner?.email || "Unassigned"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Organisation</dt><dd className="mt-1">{openDeal.organisation ? <button className="inline-flex items-center gap-1 text-[#008080] hover:underline" onClick={() => navigate(`/organisations/${openDeal.organisation!.id}`)}><Building2 className="h-3.5 w-3.5" />{openDeal.organisation.name}</button> : "—"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Contact</dt><dd className="mt-1">{openDeal.person ? <button className="inline-flex items-center gap-1 text-[#008080] hover:underline" onClick={() => navigate(`/people/${openDeal.person!.id}`)}><User className="h-3.5 w-3.5" />{openDeal.person.full_name}</button> : "—"}</dd></div>
                <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Next step</dt><dd className="mt-1">{openDeal.next_step || "—"}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Due</dt><dd className="mt-1 flex items-center gap-2">{formatDate(openDeal.due_date)}{openDeal.due_date && openDeal.due_date < todayISO() && !stages.find((s) => s.id === openDeal.stage_id)?.is_closed && <StatusBadge status="overdue" />}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Updated</dt><dd className="mt-1">{timeAgo(openDeal.updated_at)}</dd></div>
                {openDeal.notes && <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Notes</dt><dd className="mt-1 whitespace-pre-wrap">{openDeal.notes}</dd></div>}
              </dl>

              <div className="mt-6"><ActivityFeed module="deals" entityId={openDeal.id} /></div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <DealDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditing(null); if (params.get("new")) setOpenDeal(null); } }} deal={editing} stages={stages} defaults={newDefaults} onSaved={(id) => setOpenDeal(id)} />
    </div>
  );
}
