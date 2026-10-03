import type { Department } from "@/generated/prisma/enums";

const COLORS: Record<Department | "none", string> = {
  dev: "bg-brand",
  infra: "bg-slate-500",
  none: "bg-gray-400",
};

/** 名前の頭文字のアバター（プロフィール画像は持たない）。色は部署ごと */
export function Avatar({ name, department, size = "md" }: { name: string | null; department: Department | null; size?: "sm" | "md" | "lg" }) {
  const sizeClass = { sm: "size-6 text-xs", md: "size-8 text-sm", lg: "size-12 text-lg" }[size];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizeClass} ${COLORS[department ?? "none"]}`}
    >
      {(name ?? "?").trim().charAt(0) || "?"}
    </span>
  );
}
