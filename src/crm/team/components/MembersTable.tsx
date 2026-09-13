import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/datetime";
import RoleBadge from "./RoleBadge";
import ModuleMatrixDots from "./ModuleMatrixDots";
import MemberActionsMenu from "./MemberActionsMenu";
import type { TeamMember } from "../hooks/useTeamMembers";

function initials(name: string | null, email: string | null) {
  const src = name?.trim() || email?.split("@")[0] || "?";
  const parts = src.split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
}

function status(m: TeamMember) {
  if (!m.is_active) return { label: "Deactivated", sub: m.deactivated_at ? timeAgo(m.deactivated_at) : null, cls: "text-rose-600" };
  if (!m.last_seen_at) return { label: "Pending invite", sub: `Invited ${timeAgo(m.created_at)}`, cls: "text-amber-600" };
  return { label: "Active", sub: `Last seen ${timeAgo(m.last_seen_at)}`, cls: "text-emerald-600" };
}

export default function MembersTable({ members, currentUserId, onEdit, allMembers }: { members: TeamMember[]; currentUserId: string | null; onEdit: (m: TeamMember) => void; allMembers: TeamMember[] }) {
  const onlyAdminId = useMemo(() => {
    const admins = allMembers.filter((m) => m.is_active && m.role === "admin");
    return admins.length === 1 ? admins[0].id : null;
  }, [allMembers]);

  if (members.length === 0) return <div className="rounded-md border border-dashed bg-white p-12 text-center text-sm text-gray-500">No team members here.</div>;

  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Module access</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const s = status(m);
            const isMe = m.id === currentUserId;
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-[#1F3A6A] text-xs text-white">{initials(m.full_name, m.email)}</AvatarFallback></Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{m.full_name || "—"}{isMe && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}</span>
                      <span className="text-xs text-gray-500">{m.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><RoleBadge role={m.role} /></TableCell>
                <TableCell><ModuleMatrixDots perms={m.perms} isAdmin={m.role === "admin"} /></TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className={`text-sm font-medium ${s.cls}`}>{s.label}</span>
                    {s.sub && <span className="text-xs text-gray-400">{s.sub}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right"><MemberActionsMenu member={m} isSelf={isMe} isOnlyAdmin={m.id === onlyAdminId} onEdit={onEdit} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
