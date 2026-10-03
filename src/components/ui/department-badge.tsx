import type { Department } from "@/generated/prisma/enums";
import { DEPARTMENT_LABELS } from "@/lib/labels";

export function DepartmentBadge({ department }: { department: Department | null }) {
  if (!department) return null;
  const color = department === "dev" ? "bg-brand-soft text-brand-strong" : "bg-slate-100 text-slate-700";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${color}`}>{DEPARTMENT_LABELS[department]}</span>;
}
