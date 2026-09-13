import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/crm/shared/types";

const roleStyles: Record<UserRole, string> = {
  admin: "bg-[#1F3A6A] text-white hover:bg-[#1F3A6A]",
  committee: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  volunteer: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  viewer: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};

export default function RoleBadge({ role }: { role: UserRole }) {
  return <Badge className={`${roleStyles[role] ?? roleStyles.viewer} border-0 font-medium capitalize`}>{role}</Badge>;
}
