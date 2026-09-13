import { formatDateTime } from "@/lib/datetime";
import { label } from "@/crm/shared/types";
import { useTeamAudit } from "../hooks/useTeamMembers";

export default function AuditLogTab() {
  const { data = [], isLoading, error } = useTeamAudit();
  if (isLoading) return <div className="rounded-md border border-dashed bg-white p-12 text-center text-sm text-gray-500">Loading…</div>;
  if (error) return <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>;
  if (data.length === 0) return <div className="rounded-md border border-dashed bg-white p-12 text-center text-sm text-gray-500">Nothing yet — invites, role changes and deactivations show up here.</div>;
  const who = (p?: { full_name: string | null; email: string | null } | null) => p?.full_name || p?.email || "—";
  return (
    <div className="rounded-md border bg-white">
      <ul className="divide-y">
        {data.map((e) => (
          <li key={e.id} className="flex items-start gap-4 px-4 py-3 text-sm">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-[#1F3A6A]">{label(e.action)}</span>
              {e.module && <span className="text-muted-foreground"> · {e.module}</span>}
              <span className="text-gray-700"> — {who(e.actor)} → {who(e.target)}</span>
              {(e.before_value || e.after_value) && (
                <span className="block truncate text-xs text-muted-foreground">
                  {e.before_value ? `${JSON.stringify(e.before_value)} → ` : ""}{e.after_value ? JSON.stringify(e.after_value) : ""}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
