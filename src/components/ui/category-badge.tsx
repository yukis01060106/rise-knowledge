import type { CategoryKey } from "@/lib/taxonomy";
import { categoryOf } from "@/lib/taxonomy";

const ICON_PATHS: Record<CategoryKey, string> = {
  dev: "M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16",
  infra: "M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01",
  career: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z",
};

export function CategoryIcon({ category, className = "size-4" }: { category: CategoryKey; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={ICON_PATHS[category]} />
    </svg>
  );
}

/** 大分類のバッジ（分類ごとのグラデーション） */
export function CategoryBadge({ category, size = "sm" }: { category: CategoryKey | null; size?: "sm" | "md" }) {
  const c = categoryOf(category);
  if (!c) return null;
  const sizing = size === "md" ? "gap-1.5 px-3 py-1 text-sm" : "gap-1 px-2 py-0.5 text-xs";
  return (
    <span className={`cat-${c.key} cat-gradient inline-flex items-center rounded-full font-semibold text-white ${sizing}`}>
      <CategoryIcon category={c.key} className={size === "md" ? "size-4" : "size-3.5"} />
      {c.label}
    </span>
  );
}
