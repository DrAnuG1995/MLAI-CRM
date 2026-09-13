import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { label } from "../types";

const statusColors: Record<string, string> = {
  // People
  active: "bg-green-100 text-green-800 border-green-200",
  inactive: "bg-gray-100 text-gray-800 border-gray-200",
  unsubscribed: "bg-yellow-100 text-yellow-800 border-yellow-200",
  member: "bg-gray-100 text-gray-800 border-gray-200",
  speaker: "bg-purple-100 text-purple-800 border-purple-200",
  sponsor_contact: "bg-blue-100 text-blue-800 border-blue-200",
  partner: "bg-teal-100 text-teal-800 border-teal-200",
  volunteer: "bg-lime-100 text-lime-800 border-lime-200",
  organiser: "bg-indigo-100 text-indigo-800 border-indigo-200",
  // Organisations
  prospect: "bg-blue-100 text-blue-800 border-blue-200",
  lapsed: "bg-red-100 text-red-800 border-red-200",
  gold: "bg-amber-100 text-amber-800 border-amber-200",
  silver: "bg-slate-100 text-slate-700 border-slate-200",
  bronze: "bg-orange-100 text-orange-800 border-orange-200",
  community: "bg-green-100 text-green-800 border-green-200",
  // Events
  planned: "bg-gray-100 text-gray-800 border-gray-200",
  published: "bg-blue-100 text-blue-800 border-blue-200",
  done: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  // Deals / misc
  won: "bg-green-100 text-green-800 border-green-200",
  lost: "bg-red-100 text-red-800 border-red-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
  due: "bg-amber-100 text-amber-800 border-amber-200",
  follow_up: "bg-amber-100 text-amber-800 border-amber-200",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colors = statusColors[status] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", colors, className)}>
      {label(status)}
    </Badge>
  );
}
