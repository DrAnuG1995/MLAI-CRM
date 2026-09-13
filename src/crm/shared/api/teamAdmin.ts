import { supabase } from "@/lib/supabase";
import type { PermsMap } from "@/lib/permissions";
import type { AppModule, ModuleAccess, UserRole } from "../types";

/** Thin client for the team-admin Edge Function (see supabase/functions). */
async function call<T = { ok: true }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("team-admin", { body });
  if (error) {
    // supabase-js wraps non-2xx in FunctionsHttpError; pull our error string out
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") msg = (await ctx.json())?.error ?? msg;
    } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data && data.ok === false) throw new Error(data.error ?? "request failed");
  return data as T;
}

export const teamAdmin = {
  invite: (p: { email: string; full_name: string; role: UserRole; overrides?: PermsMap }) =>
    call<{ ok: true; user: { id: string; email: string } }>({ action: "invite", ...p }),
  resendInvite: (user_id: string) => call({ action: "resend_invite", user_id }),
  changeRole: (p: { user_id: string; role: UserRole; reset_permissions: boolean }) => call({ action: "change_role", ...p }),
  rename: (p: { user_id: string; full_name: string }) => call({ action: "rename", ...p }),
  setModule: (p: { user_id: string; module: AppModule; access: ModuleAccess }) => call({ action: "set_module", ...p }),
  deactivate: (user_id: string) => call({ action: "deactivate", user_id }),
  reactivate: (user_id: string) => call({ action: "reactivate", user_id }),
  sendRecovery: (user_id: string) => call({ action: "send_recovery", user_id }),
};
