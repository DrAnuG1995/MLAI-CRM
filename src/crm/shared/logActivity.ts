import { supabase } from "@/lib/supabase";
import type { Module } from "./types";

/**
 * Append a row to the cross-module activity_feed. Each record's detail page
 * shows its own slice of this table, the dashboard shows the latest across
 * every module, and a database trigger bumps people.last_touch_at whenever
 * something is logged against a person — that's what drives "needs a
 * follow-up". Best-effort: a failed log must never block the action that
 * produced it.
 */
export async function logActivity({
  module,
  entityId,
  action,
  summary,
  metadata = {},
}: {
  module: Module;
  entityId?: string | null;
  action: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("activity_feed").insert({
      module,
      entity_id: entityId || null,
      action,
      summary,
      metadata,
      created_by: user?.id || null,
    });
  } catch (err) {
    console.warn("[activity_feed] failed:", err);
  }
}
