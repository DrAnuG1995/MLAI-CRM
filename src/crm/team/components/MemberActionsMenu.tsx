import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, KeyRound, UserX, UserCheck, RefreshCw } from "lucide-react";
import { teamAdmin } from "@/crm/shared/api/teamAdmin";
import type { TeamMember } from "../hooks/useTeamMembers";

export default function MemberActionsMenu({ member, isSelf, isOnlyAdmin, onEdit }: { member: TeamMember; isSelf: boolean; isOnlyAdmin: boolean; onEdit: (m: TeamMember) => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"deactivate" | "reactivate" | null>(null);
  const isPending = member.is_active && !member.last_seen_at;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  const resend = useMutation({ mutationFn: () => teamAdmin.resendInvite(member.id), onSuccess: () => { toast.success("Invitation resent"); invalidate(); }, onError: (e: Error) => toast.error(`Couldn't resend: ${e.message}`) });
  const recovery = useMutation({ mutationFn: () => teamAdmin.sendRecovery(member.id), onSuccess: () => { toast.success("Password reset email sent"); invalidate(); }, onError: (e: Error) => toast.error(`Couldn't send reset: ${e.message}`) });
  const deactivate = useMutation({
    mutationFn: () => teamAdmin.deactivate(member.id),
    onSuccess: () => { toast.success(`${member.full_name || member.email} deactivated`); invalidate(); setConfirm(null); },
    onError: (e: Error) => { toast.error(e.message.includes("last active admin") ? "Can't deactivate the last active admin." : e.message); setConfirm(null); },
  });
  const reactivate = useMutation({
    mutationFn: () => teamAdmin.reactivate(member.id),
    onSuccess: () => { toast.success("Member reactivated"); invalidate(); setConfirm(null); },
    onError: (e: Error) => { toast.error(e.message); setConfirm(null); },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => onEdit(member)}><Pencil className="mr-2 h-4 w-4" /> Edit role &amp; access</DropdownMenuItem>
          {member.is_active && isPending && (
            <DropdownMenuItem onClick={() => resend.mutate()} disabled={resend.isPending}><RefreshCw className="mr-2 h-4 w-4" /> Resend invite</DropdownMenuItem>
          )}
          {member.is_active && !isPending && (
            <DropdownMenuItem onClick={() => recovery.mutate()} disabled={recovery.isPending}><KeyRound className="mr-2 h-4 w-4" /> Send password reset</DropdownMenuItem>
          )}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              {member.is_active ? (
                <DropdownMenuItem className="text-red-600 focus:text-red-700" disabled={isOnlyAdmin && member.role === "admin"} onClick={() => setConfirm("deactivate")}>
                  <UserX className="mr-2 h-4 w-4" /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirm("reactivate")}><UserCheck className="mr-2 h-4 w-4" /> Reactivate</DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "deactivate" ? "Deactivate" : "Reactivate"} {member.full_name || member.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "deactivate"
                ? "They'll be signed out everywhere immediately and won't be able to sign in. Their records and activity stay. You can reactivate them later."
                : "They'll be able to sign in again with their existing password and previous access."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "deactivate" ? "bg-red-600 hover:bg-red-700" : "bg-[#1F3A6A] hover:bg-[#1F3A6A]/90"}
              onClick={(e) => { e.preventDefault(); confirm === "deactivate" ? deactivate.mutate() : reactivate.mutate(); }}
            >
              {confirm === "deactivate" ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
