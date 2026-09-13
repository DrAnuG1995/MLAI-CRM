import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_MODULES, MODULE_LABELS, type PermsMap } from "@/lib/permissions";
import type { ModuleAccess } from "@/crm/shared/types";

export default function PermissionMatrix({ value, onChange, disabled }: { value: PermsMap; onChange: (next: PermsMap) => void; disabled?: boolean }) {
  return (
    <div className="rounded-md border">
      {ALL_MODULES.map((m, i) => (
        <div key={m} className={`flex items-center justify-between gap-3 px-3 py-2 ${i > 0 ? "border-t" : ""}`}>
          <span className="text-sm font-medium text-gray-700">{MODULE_LABELS[m]}</span>
          <Select value={value[m] ?? "off"} onValueChange={(v) => onChange({ ...value, [m]: v as ModuleAccess })} disabled={disabled}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="read">Read only</SelectItem>
              <SelectItem value="full">Full access</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
