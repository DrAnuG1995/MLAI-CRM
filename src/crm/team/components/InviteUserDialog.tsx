import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PermissionMatrix from "./PermissionMatrix";
import { ALL_MODULES, ROLES, ROLE_DESCRIPTIONS, defaultPermsForRole, type PermsMap } from "@/lib/permissions";
import { teamAdmin } from "@/crm/shared/api/teamAdmin";
import type { UserRole } from "@/crm/shared/types";

export default function InviteUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [perms, setPerms] = useState<PermsMap>({});
  const [overridden, setOverridden] = useState(false);

  useEffect(() => { if (role && !overridden) setPerms(defaultPermsForRole(role)); }, [role, overridden]);
  useEffect(() => { if (!open) { setEmail(""); setFullName(""); setRole(""); setPerms({}); setOverridden(false); } }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!role) throw new Error("Role is required");
      const presets = defaultPermsForRole(role);
      const overrides: PermsMap = {};
      for (const m of ALL_MODULES) if (perms[m] !== presets[m]) overrides[m] = perms[m];
      return teamAdmin.invite({ email: email.trim().toLowerCase(), full_name: fullName.trim(), role, overrides: Object.keys(overrides).length ? overrides : undefined });
    },
    onSuccess: () => {
      toast.success("Invitation sent", { description: `${email} will get an email with a link to set their password.` });
      queryClient.invalidateQueries({ queryKey: ["team"] });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      const msg = e.message === "user_already_exists" ? "Someone with that email is already on the team."
        : e.message === "forbidden" ? "Only an active admin can invite people."
        : e.message;
      toast.error(msg);
    },
  });

  const canSubmit = email.includes("@") && fullName.trim().length > 0 && role !== "" && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>They'll get an email with a link to set their password and sign in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label htmlFor="invite-email">Email *</Label><Input id="invite-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="off" /></div>
          <div className="space-y-1.5"><Label htmlFor="invite-name">Full name *</Label><Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role *</Label>
            <Select value={role} onValueChange={(v) => { setRole(v as UserRole); setOverridden(false); }}>
              <SelectTrigger id="invite-role"><SelectValue placeholder="Select a role" /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}><span className="capitalize">{r}</span><span className="ml-2 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Module access</Label>
              {role && overridden && <button type="button" className="text-xs text-[#008080] hover:underline" onClick={() => { setPerms(defaultPermsForRole(role)); setOverridden(false); }}>Reset to {role} defaults</button>}
            </div>
            {role ? (
              <PermissionMatrix value={perms} onChange={(next) => { setPerms(next); setOverridden(true); }} disabled={role === "admin"} />
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-gray-500">Select a role to see default access</div>
            )}
          </div>
        </div>
        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} className="bg-[#008080] hover:bg-[#008080]/90">{mutation.isPending ? "Sending…" : "Send invite"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
