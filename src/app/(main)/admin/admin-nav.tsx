"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/reviews", label: "レビュー待ち" },
  { href: "/admin/articles", label: "記事管理" },
  { href: "/admin/audit-logs", label: "監査ログ" },
  { href: "/admin/users", label: "ユーザー管理" },
];

export function AdminNav({ pending }: { pending: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="管理メニュー" className="flex flex-wrap gap-1">
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active ? "bg-foreground text-white" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {l.label}
            {l.href === "/admin/reviews" && pending > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs font-bold text-white">{pending}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
