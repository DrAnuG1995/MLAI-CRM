import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { useProfiles } from "../shared/hooks/useCurrentUser";
import { DEAL_KINDS, label } from "../shared/types";
import type { Deal, PipelineStage, Organisation, Person } from "../shared/types";

const NONE = "__none__";
const empty = { name: "", kind: "sponsorship", stage_id: "", organisation_id: NONE, person_id: NONE, value: "", owner_id: NONE, next_step: "", due_date: "", linear_url: "", notes: "" };

export function DealDialog({ open, onOpenChange, deal, stages, defaults, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; deal?: Deal | null; stages: PipelineStage[];
  defaults?: Partial<typeof empty>; onSaved?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const { data: profiles = [] } = useProfiles();

  useEffect(() => {
    if (!open) return;
    setForm(deal ? {
      name: deal.name, kind: deal.kind, stage_id: deal.stage_id, organisation_id: deal.organisation_id ?? NONE, person_id: deal.person_id ?? NONE,
      value: deal.value ? String(deal.value) : "", owner_id: deal.owner_id ?? NONE, next_step: deal.next_step ?? "", due_date: deal.due_date ?? "", linear_url: deal.linear_url ?? "", notes: deal.notes ?? "",
    } : { ...empty, stage_id: stages[0]?.id ?? "", ...defaults });
  }, [open, deal, stages, defaults]);

  const { data: orgs = [] } = useQuery({
    queryKey: ["organisations", "names"], enabled: open,
    queryFn: async () => { const { data, error } = await supabase.from("organisations").select("id, name").order("name"); if (error) throw error; return data as Pick<Organisation, "id" | "name">[]; },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["people", "names"], enabled: open,
    queryFn: async () => { const { data, error } = await supabase.from("people").select("id, full_name, organisation_id").order("full_name"); if (error) throw error; return data as Pick<Person, "id" | "full_name" | "organisation_id">[]; },
  });
  // Contacts at the chosen org float to the top of the picker.
  const sortedPeople = [...people].sort((a, b) => Number(b.organisation_id === form.organisation_id) - Number(a.organisation_id === form.organisation_id));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(), kind: form.kind, stage_id: form.stage_id,
        organisation_id: form.organisation_id === NONE ? null : form.organisation_id,
        person_id: form.person_id === NONE ? null : form.person_id,
        value: form.value ? Number(form.value) : 0,
        owner_id: form.owner_id === NONE ? null : form.owner_id,
        next_step: form.next_step.trim() || null, due_date: form.due_date || null,
        linear_url: form.linear_url.trim() || null, notes: form.notes.trim() || null,
      };
      if (deal) {
        const { error } = await supabase.from("deals").update(payload).eq("id", deal.id);
        if (error) throw error;
        await logActivity({ module: "deals", entityId: deal.id, action: "updated", summary: `Updated ${payload.name}` });
        return deal.id;
      }
      const { data, error } = await supabase.from("deals").insert(payload).select("id").single();
      if (error) throw error;
      const stageName = stages.find((s) => s.id === payload.stage_id)?.name ?? "";
      await logActivity({ module: "deals", entityId: data.id, action: "created", summary: `Created ${payload.name} in ${stageName}` });
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["organisations"] });
      toast.success(deal ? "Saved" : "Deal created");
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof empty) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{deal ? "Edit deal" : "New deal"}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (form.name.trim() && form.stage_id) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label>Deal name *</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Gold sponsorship 2027" required autoFocus /></div>
          <div className="space-y-1.5"><Label>Kind</Label>
            <Select value={form.kind} onValueChange={set("kind")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEAL_KINDS.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Stage</Label>
            <Select value={form.stage_id} onValueChange={set("stage_id")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Organisation</Label>
            <Select value={form.organisation_id} onValueChange={set("organisation_id")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>—</SelectItem>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Contact</Label>
            <Select value={form.person_id} onValueChange={set("person_id")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>—</SelectItem>{sortedPeople.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Value (AUD)</Label><Input type="number" min="0" step="1" value={form.value} onChange={(e) => set("value")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Owner</Label>
            <Select value={form.owner_id} onValueChange={set("owner_id")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Unassigned</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Next step</Label><Input value={form.next_step} onChange={(e) => set("next_step")(e.target.value)} placeholder="Send the deck; follow up Friday" /></div>
          <div className="space-y-1.5"><Label>Due</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Linear issue</Label><Input value={form.linear_url} onChange={(e) => set("linear_url")(e.target.value)} placeholder="https://linear.app/…" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} /></div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending} className="bg-[#008080] hover:bg-[#008080]/90">{deal ? "Save changes" : "Create deal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
