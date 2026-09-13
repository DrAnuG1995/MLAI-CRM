import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Users, Clock, History, UserX } from "lucide-react";
import { useCurrentUser } from "@/crm/shared/hooks/useCurrentUser";
import { useTeamMembers, type TeamMember } from "./hooks/useTeamMembers";
import MembersTable from "./components/MembersTable";
import InviteUserDialog from "./components/InviteUserDialog";
import EditUserDialog from "./components/EditUserDialog";
import AuditLogTab from "./components/AuditLogTab";

export default function TeamPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const { userId, isAdmin } = useCurrentUser();
  const { data: members = [], isLoading, error } = useTeamMembers();

  const active = useMemo(() => members.filter((m) => m.is_active && m.last_seen_at), [members]);
  const pending = useMemo(() => members.filter((m) => m.is_active && !m.last_seen_at), [members]);
  const deactivated = useMemo(() => members.filter((m) => !m.is_active), [members]);
  const liveEditing = useMemo(() => (editing ? members.find((m) => m.id === editing.id) ?? null : null), [editing, members]);
  const isOnlyAdminTarget = useMemo(() => {
    const admins = members.filter((m) => m.is_active && m.role === "admin");
    return !!liveEditing && admins.length === 1 && admins[0].id === liveEditing.id;
  }, [liveEditing, members]);

  if (!isAdmin) return <div className="text-sm text-gray-500">Only admins can manage the team.</div>;

  const table = (rows: TeamMember[]) => <MembersTable members={rows} currentUserId={userId} onEdit={setEditing} allMembers={members} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#008080]">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invite committee members, assign roles, and control access per module.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="bg-[#008080] hover:bg-[#008080]/90"><UserPlus className="mr-2 h-4 w-4" /> Invite team member</Button>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="bg-white">
          <TabsTrigger value="members"><Users className="mr-2 h-4 w-4" /> Members <span className="ml-2 text-xs text-gray-500">({active.length})</span></TabsTrigger>
          <TabsTrigger value="pending"><Clock className="mr-2 h-4 w-4" /> Pending invites {pending.length > 0 && <span className="ml-2 text-xs text-gray-500">({pending.length})</span>}</TabsTrigger>
          <TabsTrigger value="deactivated"><UserX className="mr-2 h-4 w-4" /> Deactivated {deactivated.length > 0 && <span className="ml-2 text-xs text-gray-500">({deactivated.length})</span>}</TabsTrigger>
          <TabsTrigger value="audit"><History className="mr-2 h-4 w-4" /> Team audit</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-4">
          {isLoading ? <div className="rounded-md border border-dashed bg-white p-12 text-center text-sm text-gray-500">Loading team…</div>
            : error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Couldn't load the team. {(error as Error).message}</div>
            : table(active)}
        </TabsContent>
        <TabsContent value="pending" className="mt-4">{table(pending)}</TabsContent>
        <TabsContent value="deactivated" className="mt-4">{table(deactivated)}</TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogTab /></TabsContent>
      </Tabs>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditUserDialog member={liveEditing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} isOnlyAdmin={isOnlyAdminTarget} isSelf={liveEditing?.id === userId} />
    </div>
  );
}
