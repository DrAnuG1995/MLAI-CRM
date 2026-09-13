import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PermissionMatrix from "./PermissionMatrix";
import { ALL_MODULES, ROLES, defaultPermsForRole, type PermsMap } from "@/lib/permissions";
import { teamAdmin } from "@/crm/shared/api/teamAdmin";
import type { ModuleAccess, UserRole } from "@/crm/shared/types";
import type { TeamMember } from "../hooks/useTeamMembers";

export default function EditUserDialog({ member, open, onOpenChange, isOnlyAdmin, isSelf }: {
  member: TeamMember | null; open: boolean; onOpenChange: (o: boolean) => void; isOnlyAdmin: boolean; isSelf: boolean;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<UserRole>("viewer");
  const [perms, setPerms] = useState<PermsMap>({});
  const [name, setName] = useState("");

  useEffect(() => {
    if (member) { setRole(member.role); setPerms(member.perms); setName(member.full_name || ""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, open]);

  const roleChanged = member ? role !== member.role : false;
  useEffect(() => {
    if (!member) return;
    setPerms(roleChanged ? defaultPermsForRole(role) : member.perms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, member?.id]);

  const matrixDirty = useMemo(() => {
    if (!member) return false;
    const reference = roleChanged ? defaultPermsForRole(role) : member.perms;
    return ALL_MODULES.some((m) => (perms[m] ?? "off") !== (reference[m] ?? "off"));
  }, [member, role, perms, roleChanged]);
  const nameChanged = member ? name.trim().length > 0 && name.trim() !== (member.full_name || "") : false;
  const isDirty = roleChanged || matrixDirty || nameChanged;
  const willDemoteOnlyAdmin = isOnlyAdmin && member?.role === "admin" && role !== "admin";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!member) throw new Error("No member");
      if (nameChanged) await teamAdmin.rename({ user_id: member.id, full_name: name.trim() });
      if (roleChanged) await teamAdmin.changeRole({ user_id: member.id, role, reset_permissions: true });
      const reference = roleChanged ? defaultPermsForRole(role) : member.perms;
      await Promise.all(ALL_MODULES.flatMap((m) => {
        const next = (perms[m] ?? "off") as ModuleAccess;
        return next !== ((reference[m] ?? "off") as ModuleAccess) ? [teamAdmin.setModule({ user_id: member.id, module: m, access: next })] : [];
      }));
    },
    onSuccess: () => {
      toast.success("Member updated");
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message.includes("last active admin") ? "Can't demote the last active admin." : e.message),
  });

  if (!member) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {member.full_name || member.email}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)} disabled={isSelf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
            </Select>
            {isSelf && <p className="text-xs text-muted-foreground">You can't change your own role.</p>}
            {willDemoteOnlyAdmin && <p className="text-xs text-red-600">This is the only active admin — promote someone else first.</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Module access</Label>
              {role !== "admin" && matrixDirty && <button type="button" className="text-xs text-[#008080] hover:underline" onClick={() => setPerms(roleChanged ? defaultPermsForRole(role) : member.perms)}>Reset</button>}
            </div>
            <PermissionMatrix value={role === "admin" ? defaultPermsForRole("admin") : perms} onChange={setPerms} disabled={role === "admin"} />
            {role === "admin" && <p className="text-xs text-muted-foreground">Admins always have full access to every module.</p>}
          </div>
        </div>
        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!isDirty || willDemoteOnlyAdmin || mutation.isPending} className="bg-[#008080] hover:bg-[#008080]/90">{mutation.isPending ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
