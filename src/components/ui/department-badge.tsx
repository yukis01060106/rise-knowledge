import type { Department } from "@/generated/prisma/enums";
import { DEPARTMENT_LABELS } from "@/lib/labels";

export function DepartmentBadge({ department }: { department: Department | null }) {
  if (!department) return null;
  const color = department === "dev" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${color}`}>{DEPARTMENT_LABELS[department]}</span>;
}
