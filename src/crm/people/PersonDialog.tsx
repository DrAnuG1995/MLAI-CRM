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
import { PERSON_TYPES, PERSON_STATUSES, label } from "../shared/types";
import type { Person, Organisation } from "../shared/types";

const NONE = "__none__";

const empty = {
  full_name: "",
  email: "",
  phone: "",
  slack_handle: "",
  linkedin_url: "",
  role_title: "",
  organisation_id: NONE,
  type: "member",
  status: "active",
  tags: "",
  notes: "",
};

export function PersonDialog({
  open,
  onOpenChange,
  person,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  person?: Person | null;
  defaults?: Partial<typeof empty>;
  onSaved?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setForm(
      person
        ? {
            full_name: person.full_name,
            email: person.email ?? "",
            phone: person.phone ?? "",
            slack_handle: person.slack_handle ?? "",
            linkedin_url: person.linkedin_url ?? "",
            role_title: person.role_title ?? "",
            organisation_id: person.organisation_id ?? NONE,
            type: person.type,
            status: person.status,
            tags: (person.tags ?? []).join(", "),
            notes: person.notes ?? "",
          }
        : { ...empty, ...defaults }
    );
  }, [open, person, defaults]);

  const { data: orgs = [] } = useQuery({
    queryKey: ["organisations", "names"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("organisations").select("id, name").order("name");
      if (error) throw error;
      return data as Pick<Organisation, "id" | "name">[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        slack_handle: form.slack_handle.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        role_title: form.role_title.trim() || null,
        organisation_id: form.organisation_id === NONE ? null : form.organisation_id,
        type: form.type,
        status: form.status,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
      };
      if (person) {
        const { error } = await supabase.from("people").update(payload).eq("id", person.id);
        if (error) throw error;
        await logActivity({ module: "people", entityId: person.id, action: "updated", summary: `Updated ${payload.full_name}` });
        return person.id;
      }
      const { data, error } = await supabase.from("people").insert(payload).select("id").single();
      if (error) throw error;
      await logActivity({ module: "people", entityId: data.id, action: "created", summary: `Added ${payload.full_name} as ${label(payload.type).toLowerCase()}` });
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["person", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success(person ? "Saved" : "Person added");
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof empty) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle></DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); if (form.full_name.trim()) save.mutate(); }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Full name *</Label>
            <Input value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={set("type")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PERSON_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PERSON_STATUSES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Slack handle</Label>
            <Input value={form.slack_handle} onChange={(e) => set("slack_handle")(e.target.value)} placeholder="@name" />
          </div>
          <div className="space-y-1.5">
            <Label>LinkedIn URL</Label>
            <Input value={form.linkedin_url} onChange={(e) => set("linkedin_url")(e.target.value)} placeholder="https://linkedin.com/in/…" />
          </div>
          <div className="space-y-1.5">
            <Label>Role / title</Label>
            <Input value={form.role_title} onChange={(e) => set("role_title")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Organisation</Label>
            <Select value={form.organisation_id} onValueChange={set("organisation_id")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tags</Label>
            <Input value={form.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="comma-separated · nlp, founder, wants-to-speak" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending} className="bg-[#1F3A6A] hover:bg-[#1F3A6A]/90">{person ? "Save changes" : "Add person"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
