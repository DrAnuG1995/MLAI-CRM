import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ALL_MODULES, MODULE_LABELS, type PermsMap } from "@/lib/permissions";
import type { ModuleAccess } from "@/crm/shared/types";

const dotColor: Record<ModuleAccess, string> = { off: "bg-gray-200", read: "bg-blue-400", full: "bg-emerald-500" };
const accessLabel: Record<ModuleAccess, string> = { off: "No access", read: "Read only", full: "Full access" };

export default function ModuleMatrixDots({ perms, isAdmin }: { perms: PermsMap; isAdmin?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {ALL_MODULES.map((m) => {
        const access: ModuleAccess = isAdmin ? "full" : perms[m] ?? "off";
        return (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <span className={`h-2.5 w-2.5 rounded-full ${dotColor[access]} ring-1 ring-inset ring-black/5`} aria-label={`${MODULE_LABELS[m]}: ${accessLabel[access]}`} />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{MODULE_LABELS[m]}: <strong>{accessLabel[access]}</strong></TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
