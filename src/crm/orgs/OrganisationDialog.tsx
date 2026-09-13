import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "../shared/logActivity";
import { ORG_KINDS, ORG_TIERS, ORG_STATUSES, label } from "../shared/types";
import type { Organisation } from "../shared/types";

const NONE = "__none__";
const empty = { name: "", kind: "sponsor", tier: NONE, status: "prospect", website: "", location: "", notes: "" };

export function OrganisationDialog({ open, onOpenChange, org, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; org?: Organisation | null; onSaved?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setForm(org ? { name: org.name, kind: org.kind, tier: org.tier ?? NONE, status: org.status, website: org.website ?? "", location: org.location ?? "", notes: org.notes ?? "" } : empty);
  }, [open, org]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        tier: form.tier === NONE ? null : form.tier,
        status: form.status,
        website: form.website.trim() || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (org) {
        const { error } = await supabase.from("organisations").update(payload).eq("id", org.id);
        if (error) throw error;
        await logActivity({ module: "organisations", entityId: org.id, action: "updated", summary: `Updated ${payload.name}` });
        return org.id;
      }
      const { data, error } = await supabase.from("organisations").insert(payload).select("id").single();
      if (error) throw error;
      await logActivity({ module: "organisations", entityId: data.id, action: "created", summary: `Added ${payload.name} (${label(payload.kind).toLowerCase()})` });
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["organisations"] });
      queryClient.invalidateQueries({ queryKey: ["organisation", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success(org ? "Saved" : "Organisation added");
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof empty) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{org ? "Edit organisation" : "Add organisation"}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => set("name")(e.target.value)} required autoFocus /></div>
          <div className="space-y-1.5"><Label>Kind</Label>
            <Select value={form.kind} onValueChange={set("kind")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORG_KINDS.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORG_STATUSES.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Sponsor tier</Label>
            <Select value={form.tier} onValueChange={set("tier")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>—</SelectItem>{ORG_TIERS.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={(e) => set("location")(e.target.value)} placeholder="Melbourne" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Website</Label><Input value={form.website} onChange={(e) => set("website")(e.target.value)} placeholder="https://" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} /></div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending} className="bg-[#008080] hover:bg-[#008080]/90">{org ? "Save changes" : "Add organisation"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
