// ============================================================
// team-admin Edge Function — the only place team membership changes.
// ------------------------------------------------------------
// Actions: invite, resend_invite, change_role, rename, set_module,
//          deactivate, reactivate, send_recovery.
//
// Security model (same as the StatDoctor CRM):
//   1. Caller must be authenticated (Authorization: Bearer <user JWT>)
//   2. Caller must be an ACTIVE ADMIN — checked in the DB, not the JWT
//   3. CORS restricted to FRONTEND_URL (+ localhost)
//   4. Inputs validated with zod
//   5. Privileged ops use the service-role client
//   6. Every successful action writes a team_audit_log row
//
// Deploy:  supabase functions deploy team-admin --project-ref <ref>
// Secrets: supabase secrets set FRONTEND_URL=https://dranug1995.github.io/MLAI-CRM --project-ref <ref>
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// No trailing slash. The app is hash-routed, so the invite/recovery link
// lands on the root and App.tsx forwards to #/onboarding.
const FRONTEND_URL = (Deno.env.get("FRONTEND_URL") ?? "http://localhost:8080").replace(/\/$/, "");
const REDIRECT_TO = `${FRONTEND_URL}/`;

const ALLOWED_ORIGINS = new Set([
  FRONTEND_URL,
  ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
]);
function corsHeaders(req?: Request) {
  const reqOrigin = req?.headers.get("Origin") ?? "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin);
  const originOk = isLocalhost || [...ALLOWED_ORIGINS].some((o) => reqOrigin === o || reqOrigin === new URL(o).origin);
  return {
    "Access-Control-Allow-Origin": originOk ? reqOrigin : new URL(FRONTEND_URL).origin,
    "Access-Control-Allow-Headers": req?.headers.get("Access-Control-Request-Headers") ?? "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin, Access-Control-Request-Headers",
  };
}

const ROLES = ["admin", "committee", "volunteer", "viewer"] as const;
const ACCESS = ["off", "read", "full"] as const;
const MODULES = ["dashboard", "people", "organisations", "pipeline", "events", "team"] as const;

const inviteSchema = z.object({
  action: z.literal("invite"),
  email: z.string().email().toLowerCase(),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  overrides: z.record(z.enum(MODULES), z.enum(ACCESS)).optional(),
});
const resendInviteSchema = z.object({ action: z.literal("resend_invite"), user_id: z.string().uuid() });
const changeRoleSchema = z.object({ action: z.literal("change_role"), user_id: z.string().uuid(), role: z.enum(ROLES), reset_permissions: z.boolean().default(true) });
const setModuleSchema = z.object({ action: z.literal("set_module"), user_id: z.string().uuid(), module: z.enum(MODULES), access: z.enum(ACCESS) });
const renameSchema = z.object({ action: z.literal("rename"), user_id: z.string().uuid(), full_name: z.string().trim().min(1).max(120) });
const userIdOnlySchema = z.object({ action: z.enum(["deactivate", "reactivate", "send_recovery"]), user_id: z.string().uuid() });
const requestSchema = z.discriminatedUnion("action", [inviteSchema, resendInviteSchema, changeRoleSchema, setModuleSchema, renameSchema, userIdOnlySchema]);
type RequestPayload = z.infer<typeof requestSchema>;

function jsonResponse(status: number, body: unknown, req: Request) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
// Identical 403 for every failure mode — never leak whether a user exists.
const denied = (req: Request) => jsonResponse(403, { ok: false, error: "forbidden" }, req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "method not allowed" }, req);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return denied(req);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !user) return denied(req);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller } = await supabase.from("profiles").select("id, role, is_active").eq("id", user.id).single();
  if (!caller || caller.role !== "admin" || !caller.is_active) return denied(req);

  let payload: RequestPayload;
  try {
    payload = requestSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(400, { ok: false, error: `invalid payload: ${msg.slice(0, 400)}` }, req);
  }

  const ctx: Ctx = {
    supabase,
    supabaseAuth,
    actorId: caller.id,
    ip: req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: req.headers.get("user-agent"),
  };

  try {
    switch (payload.action) {
      case "invite": return await handleInvite(payload, ctx, req);
      case "resend_invite": return await handleResendInvite(payload, ctx, req);
      case "change_role": return await handleChangeRole(payload, ctx, req);
      case "rename": return await handleRename(payload, ctx, req);
      case "set_module": return await handleSetModule(payload, ctx, req);
      case "deactivate": return await handleDeactivate(payload, ctx, req);
      case "reactivate": return await handleReactivate(payload, ctx, req);
      case "send_recovery": return await handleSendRecovery(payload, ctx, req);
    }
  } catch (e) {
    console.error("[team-admin]", payload.action, e);
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: `internal_error: ${msg.slice(0, 400)}` }, req);
  }
});

// ============================================================
type SbClient = ReturnType<typeof createClient>;
interface Ctx { supabase: SbClient; supabaseAuth: SbClient; actorId: string; ip: string | null; ua: string | null }

async function writeAudit(ctx: Ctx, action: string, targetUserId: string | null, module: string | null, before: unknown, after: unknown) {
  await ctx.supabase.from("team_audit_log").insert({
    actor_id: ctx.actorId, target_user_id: targetUserId, action, module,
    before_value: before ?? null, after_value: after ?? null,
    metadata: { ip: ctx.ip, user_agent: ctx.ua },
  });
}

/** True when the account was invited but never finished signing in. */
async function isPendingAccount(ctx: Ctx, userId: string): Promise<boolean> {
  const { data: profile } = await ctx.supabase.from("profiles").select("last_seen_at").eq("id", userId).single();
  if (profile?.last_seen_at) return false;
  const { data } = await ctx.supabase.auth.admin.getUserById(userId);
  return !data?.user?.last_sign_in_at;
}

/** Remove a never-used account so a fresh invite can be issued (cascades profile + permissions). */
async function discardPendingAccount(ctx: Ctx, userId: string) {
  const { error } = await ctx.supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(`could not replace pending account: ${error.message}`);
}

async function handleInvite(p: z.infer<typeof inviteSchema>, ctx: Ctx, req: Request) {
  const { data: existing } = await ctx.supabase.from("profiles").select("id, is_active").ilike("email", p.email).maybeSingle();
  if (existing) {
    // A pending invite (accepted or not, active or deactivated) is simply replaced.
    if (await isPendingAccount(ctx, existing.id)) {
      await discardPendingAccount(ctx, existing.id);
      await writeAudit(ctx, "invite_replaced", null, null, { user_id: existing.id }, { email: p.email });
    } else if (!existing.is_active) {
      return jsonResponse(409, { ok: false, error: "user_deactivated" }, req);
    } else {
      return jsonResponse(409, { ok: false, error: "user_already_exists" }, req);
    }
  }

  // The DB trigger reads full_name + role from this metadata and seeds the
  // role's default permissions; overrides are layered on afterwards.
  const { data: invited, error: inviteErr } = await ctx.supabase.auth.admin.inviteUserByEmail(p.email, {
    data: { full_name: p.full_name, role: p.role },
    redirectTo: REDIRECT_TO,
  });
  if (inviteErr || !invited?.user) {
    return jsonResponse(500, { ok: false, error: `invite_failed: ${inviteErr?.message ?? "no user returned"}` }, req);
  }
  if (p.overrides && Object.keys(p.overrides).length) {
    const rows = Object.entries(p.overrides).map(([module, access]) => ({ user_id: invited.user!.id, module, access }));
    await ctx.supabase.from("user_module_permissions").upsert(rows, { onConflict: "user_id,module" });
  }
  await writeAudit(ctx, "invite_sent", invited.user.id, null, null, { email: p.email, role: p.role, overrides: p.overrides ?? null });
  return jsonResponse(200, { ok: true, user: { id: invited.user.id, email: invited.user.email } }, req);
}

async function handleResendInvite(p: z.infer<typeof resendInviteSchema>, ctx: Ctx, req: Request) {
  const { data: profile } = await ctx.supabase.from("profiles").select("id, email, full_name, role").eq("id", p.user_id).single();
  if (!profile?.email) return denied(req);
  if (!(await isPendingAccount(ctx, profile.id))) {
    // They have signed in before, so a fresh invite would be wrong — send a password reset.
    const { error: recErr } = await ctx.supabaseAuth.auth.resetPasswordForEmail(profile.email, { redirectTo: REDIRECT_TO });
    if (recErr) return jsonResponse(500, { ok: false, error: `resend_failed: ${recErr.message}` }, req);
    await writeAudit(ctx, "invite_resent", p.user_id, null, null, { email: profile.email, mode: "recovery" });
    return jsonResponse(200, { ok: true, mode: "recovery" }, req);
  }
  // Supabase refuses to re-invite an existing user, so recreate the pending
  // account with the same role, name and permissions and invite it afresh.
  const { data: perms } = await ctx.supabase.from("user_module_permissions").select("module, access").eq("user_id", profile.id);
  await discardPendingAccount(ctx, profile.id);
  const { data: invited, error } = await ctx.supabase.auth.admin.inviteUserByEmail(profile.email, {
    data: { full_name: profile.full_name, role: profile.role },
    redirectTo: REDIRECT_TO,
  });
  if (error || !invited?.user) return jsonResponse(500, { ok: false, error: `resend_failed: ${error?.message ?? "no user returned"}` }, req);
  if (perms?.length) {
    await ctx.supabase.from("user_module_permissions").upsert(perms.map((r) => ({ user_id: invited.user!.id, module: r.module, access: r.access })), { onConflict: "user_id,module" });
  }
  await writeAudit(ctx, "invite_resent", invited.user.id, null, { user_id: profile.id }, { email: profile.email, mode: "reissued" });
  return jsonResponse(200, { ok: true, mode: "reissued", user: { id: invited.user.id } }, req);
}

async function handleChangeRole(p: z.infer<typeof changeRoleSchema>, ctx: Ctx, req: Request) {
  if (p.user_id === ctx.actorId) return jsonResponse(400, { ok: false, error: "cannot_change_own_role" }, req);
  const { data: before } = await ctx.supabase.from("profiles").select("role").eq("id", p.user_id).single();
  if (!before) return denied(req);
  // The last-admin trigger rejects this if it would leave zero admins.
  const { error: updErr } = await ctx.supabase.from("profiles").update({ role: p.role, updated_at: new Date().toISOString() }).eq("id", p.user_id);
  if (updErr) return jsonResponse(400, { ok: false, error: updErr.message }, req);
  if (p.reset_permissions) {
    const { data: modules } = await ctx.supabase.from("app_modules").select("module");
    const rows = await Promise.all((modules ?? []).map(async (m: { module: string }) => {
      const { data } = await ctx.supabase.rpc("default_access_for_role", { p_role: p.role, p_module: m.module });
      return { user_id: p.user_id, module: m.module, access: data as string, updated_at: new Date().toISOString() };
    }));
    await ctx.supabase.from("user_module_permissions").upsert(rows, { onConflict: "user_id,module" });
  }
  await writeAudit(ctx, "role_changed", p.user_id, null, { role: before.role }, { role: p.role, reset_permissions: p.reset_permissions });
  return jsonResponse(200, { ok: true }, req);
}

async function handleRename(p: z.infer<typeof renameSchema>, ctx: Ctx, req: Request) {
  const { data: before } = await ctx.supabase.from("profiles").select("full_name").eq("id", p.user_id).single();
  if (!before) return denied(req);
  const { error } = await ctx.supabase.from("profiles").update({ full_name: p.full_name, updated_at: new Date().toISOString() }).eq("id", p.user_id);
  if (error) return jsonResponse(400, { ok: false, error: error.message }, req);
  await writeAudit(ctx, "name_changed", p.user_id, null, { full_name: before.full_name }, { full_name: p.full_name });
  return jsonResponse(200, { ok: true }, req);
}

async function handleSetModule(p: z.infer<typeof setModuleSchema>, ctx: Ctx, req: Request) {
  const { data: before } = await ctx.supabase.from("user_module_permissions").select("access").eq("user_id", p.user_id).eq("module", p.module).maybeSingle();
  const { error } = await ctx.supabase.from("user_module_permissions").upsert(
    { user_id: p.user_id, module: p.module, access: p.access, updated_at: new Date().toISOString() },
    { onConflict: "user_id,module" },
  );
  if (error) return jsonResponse(400, { ok: false, error: error.message }, req);
  await writeAudit(ctx, "module_permission_changed", p.user_id, p.module, { access: before?.access ?? "off" }, { access: p.access });
  return jsonResponse(200, { ok: true }, req);
}

async function handleDeactivate(p: z.infer<typeof userIdOnlySchema>, ctx: Ctx, req: Request) {
  if (p.user_id === ctx.actorId) return jsonResponse(400, { ok: false, error: "cannot_deactivate_self" }, req);
  const { error } = await ctx.supabase.from("profiles").update({ is_active: false, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.user_id);
  if (error) return jsonResponse(400, { ok: false, error: error.message }, req);
  await ctx.supabase.auth.admin.updateUserById(p.user_id, { ban_duration: "876600h" }); // ~100 years
  await ctx.supabase.auth.admin.signOut(p.user_id, "global");
  await writeAudit(ctx, "user_deactivated", p.user_id, null, null, null);
  return jsonResponse(200, { ok: true }, req);
}

async function handleReactivate(p: z.infer<typeof userIdOnlySchema>, ctx: Ctx, req: Request) {
  const { error } = await ctx.supabase.from("profiles").update({ is_active: true, deactivated_at: null, updated_at: new Date().toISOString() }).eq("id", p.user_id);
  if (error) return jsonResponse(400, { ok: false, error: error.message }, req);
  await ctx.supabase.auth.admin.updateUserById(p.user_id, { ban_duration: "none" });
  await writeAudit(ctx, "user_reactivated", p.user_id, null, null, null);
  return jsonResponse(200, { ok: true }, req);
}

async function handleSendRecovery(p: z.infer<typeof userIdOnlySchema>, ctx: Ctx, req: Request) {
  const { data: profile } = await ctx.supabase.from("profiles").select("email").eq("id", p.user_id).single();
  if (!profile?.email) return denied(req);
  const { error } = await ctx.supabaseAuth.auth.resetPasswordForEmail(profile.email, { redirectTo: REDIRECT_TO });
  if (error) return jsonResponse(500, { ok: false, error: `recovery_failed: ${error.message}` }, req);
  await writeAudit(ctx, "password_reset_sent", p.user_id, null, null, { email: profile.email });
  return jsonResponse(200, { ok: true }, req);
}
