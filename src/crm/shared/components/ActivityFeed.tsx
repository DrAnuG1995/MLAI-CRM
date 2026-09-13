import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity as ActivityIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "../logActivity";
import type { Activity, Module } from "../types";
import { label } from "../types";
import { useCurrentUser } from "../hooks/useCurrentUser";

const LOG_TYPES = ["note", "email", "meeting", "slack", "call"];

/**
 * Per-record activity timeline with a quick "log a touch" form — the same
 * card that sits on every StatDoctor CRM detail page. Logging against a
 * person bumps last_touch_at (database trigger), which is what clears
 * them from the dashboard's follow-up list.
 */
export function ActivityFeed({ module, entityId }: { module: Module; entityId: string }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState("note");
  const [text, setText] = useState("");
  const { canWrite } = useCurrentUser();
  const writable = canWrite(module === "deals" ? "pipeline" : module);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["activity", module, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_feed")
        .select("*, profile:profiles(full_name, email)")
        .eq("module", module)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Activity[];
    },
  });

  const log = useMutation({
    mutationFn: async () => {
      await logActivity({ module, entityId, action: type, summary: text.trim() });
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["activity", module, entityId] });
      queryClient.invalidateQueries({ queryKey: [module] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      toast.success("Logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon className="h-4 w-4" /> Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {writable && <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) log.mutate();
          }}
        >
          <div className="flex gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOG_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!text.trim() || log.isPending} className="ml-auto bg-[#1F3A6A] hover:bg-[#1F3A6A]/90">
              <Send className="mr-2 h-4 w-4" /> Log
            </Button>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What happened? e.g. Sent the Gold tier deck — they'll come back next week"
            rows={2}
          />
        </form>}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#1F3A6A]">{label(a.action)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(a.created_at)}
                    {a.profile?.full_name || a.profile?.email ? ` · ${a.profile.full_name || a.profile.email}` : ""}
                  </span>
                </div>
                {a.summary && <p className="mt-0.5 whitespace-pre-wrap text-gray-700">{a.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
