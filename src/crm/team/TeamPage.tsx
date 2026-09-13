import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "../shared/components/PageHeader";
import { DataTable, Column } from "../shared/components/DataTable";
import { StatusBadge } from "../shared/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentUser, useProfiles } from "../shared/hooks/useCurrentUser";
import type { Profile } from "../shared/types";

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { profile: me, isAdmin } = useCurrentUser();
  const { data: profiles = [], isLoading } = useProfiles();

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => { const { error } = await supabase.from("profiles").update({ role }).eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["profiles"] }); toast.success("Role updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Profile>[] = [
    { key: "name", header: "Name", render: (p) => <span className="font-medium">{p.full_name || <span className="text-muted-foreground">—</span>}{p.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</span> },
    { key: "email", header: "Email", render: (p) => <span className="text-sm">{p.email}</span> },
    {
      key: "role", header: "Role",
      render: (p) => isAdmin && p.id !== me?.id ? (
        <Select value={p.role} onValueChange={(v) => setRole.mutate({ id: p.id, role: v })}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
        </Select>
      ) : <StatusBadge status={p.role} className={p.role === "admin" ? "bg-indigo-100 text-indigo-800 border-indigo-200" : ""} />,
    },
    { key: "since", header: "Since", render: (p) => <span className="text-sm text-muted-foreground">{formatDate(p.created_at)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Team" description="Committee members with access to this CRM" />
      <DataTable columns={columns} data={profiles} loading={isLoading} emptyMessage="No accounts yet" />
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Adding someone to the committee</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>There's no public sign-up. In the Supabase dashboard go to <strong>Authentication → Users → Add user</strong>, enter their email and a temporary password, and tick <em>Auto confirm</em>. Their profile row appears here on first sign-in; an admin can then promote them.</p>
          <p className="text-muted-foreground">Everyone signed in can read and edit every record — the role only controls who can change roles here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
