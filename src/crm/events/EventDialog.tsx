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
import { EVENT_KINDS, EVENT_STATUSES, label } from "../shared/types";
import type { Event, Organisation } from "../shared/types";

const NONE = "__none__";
const empty = { title: "", kind: "meetup", status: "planned", date: "", time: "18:00", venue: "", venue_organisation_id: NONE, capacity: "", notes: "" };

/** Melbourne wall-clock → ISO. The browser may be anywhere; the event isn't. */
function toISO(date: string, time: string) {
  const local = new Date(`${date}T${time || "18:00"}:00`);
  const melb = new Date(local.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
  const offset = local.getTime() - melb.getTime();
  return new Date(local.getTime() + offset).toISOString();
}
function fromISO(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}

export function EventDialog({ open, onOpenChange, event, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; event?: Event | null; onSaved?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    if (event) {
      const { date, time } = fromISO(event.starts_at);
      setForm({ title: event.title, kind: event.kind, status: event.status, date, time, venue: event.venue ?? "", venue_organisation_id: event.venue_organisation_id ?? NONE, capacity: event.capacity ? String(event.capacity) : "", notes: event.notes ?? "" });
    } else setForm(empty);
  }, [open, event]);

  const { data: venues = [] } = useQuery({
    queryKey: ["organisations", "names"], enabled: open,
    queryFn: async () => { const { data, error } = await supabase.from("organisations").select("id, name").order("name"); if (error) throw error; return data as Pick<Organisation, "id" | "name">[]; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(), kind: form.kind, status: form.status, starts_at: toISO(form.date, form.time),
        venue: form.venue.trim() || null, venue_organisation_id: form.venue_organisation_id === NONE ? null : form.venue_organisation_id,
        capacity: form.capacity ? Number(form.capacity) : null, notes: form.notes.trim() || null,
      };
      if (event) {
        const { error } = await supabase.from("events").update(payload).eq("id", event.id);
        if (error) throw error;
        await logActivity({ module: "events", entityId: event.id, action: "updated", summary: `Updated ${payload.title}` });
        return event.id;
      }
      const { data, error } = await supabase.from("events").insert(payload).select("id").single();
      if (error) throw error;
      await logActivity({ module: "events", entityId: data.id, action: "created", summary: `Scheduled ${payload.title}` });
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success(event ? "Saved" : "Event added");
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof empty) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{event ? "Edit event" : "Add event"}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (form.title.trim() && form.date) save.mutate(); }}>
          <div className="space-y-1.5 sm:col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="MLAI Meetup — LLM agents in production" required autoFocus /></div>
          <div className="space-y-1.5"><Label>Kind</Label>
            <Select value={form.kind} onValueChange={set("kind")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_KINDS.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={form.status} onValueChange={set("status")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_STATUSES.map((k) => <SelectItem key={k} value={k}>{label(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Start (Melbourne)</Label><Input type="time" value={form.time} onChange={(e) => set("time")(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Venue</Label><Input value={form.venue} onChange={(e) => set("venue")(e.target.value)} placeholder="Level 3, 123 Collins St" /></div>
          <div className="space-y-1.5"><Label>Hosted by</Label>
            <Select value={form.venue_organisation_id} onValueChange={set("venue_organisation_id")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>—</SelectItem>{venues.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Capacity</Label><Input type="number" min="0" value={form.capacity} onChange={(e) => set("capacity")(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} /></div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending} className="bg-[#008080] hover:bg-[#008080]/90">{event ? "Save changes" : "Add event"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
