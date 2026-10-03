"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean; badge?: number };
type Section = { title?: string; items: Item[] };

const icon = (d: string) => (
  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0">
    <path d={d} />
  </svg>
);

const ICONS = {
  home: icon("M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"),
  articles: icon("M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"),
  tags: icon("M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01"),
  search: icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"),
  write: icon("M4 20h4L19 9l-4-4L4 16zM14 6l4 4"),
  mine: icon("M4 5h11l5 5v9H4zM15 5v5h5"),
  settings: icon("M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"),
  review: icon("M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"),
  manage: icon("M4 6h16M4 12h16M4 18h10"),
  audit: icon("M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"),
  users: icon("M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8"),
};

function sections(isAdmin: boolean, pendingReviews: number): Section[] {
  const list: Section[] = [
    {
      items: [
        { href: "/", label: "ホーム", icon: ICONS.home, match: (p) => p === "/" },
        {
          href: "/articles",
          label: "記事",
          icon: ICONS.articles,
          match: (p) => p === "/articles" || /^\/articles\/[^/]+$/.test(p),
        },
        { href: "/tags", label: "タグ", icon: ICONS.tags, match: (p) => p.startsWith("/tags") },
        { href: "/search", label: "検索", icon: ICONS.search, match: (p) => p.startsWith("/search") },
      ],
    },
    {
      title: "自分",
      items: [
        { href: "/articles/new", label: "記事を書く", icon: ICONS.write, match: (p) => p === "/articles/new" || p.endsWith("/edit") },
        { href: "/me/articles", label: "自分の記事", icon: ICONS.mine, match: (p) => p.startsWith("/me/articles") },
        { href: "/me/settings", label: "設定", icon: ICONS.settings, match: (p) => p.startsWith("/me/settings") },
      ],
    },
  ];
  if (isAdmin) {
    list.push({
      title: "管理",
      items: [
        { href: "/admin/reviews", label: "レビュー待ち", icon: ICONS.review, match: (p) => p.startsWith("/admin/reviews"), badge: pendingReviews },
        { href: "/admin/articles", label: "記事管理", icon: ICONS.manage, match: (p) => p.startsWith("/admin/articles") },
        { href: "/admin/audit-logs", label: "監査ログ", icon: ICONS.audit, match: (p) => p.startsWith("/admin/audit-logs") },
        { href: "/admin/users", label: "ユーザー管理", icon: ICONS.users, match: (p) => p.startsWith("/admin/users") },
      ],
    });
  }
  return list;
}

export type SideNavProps = { isAdmin: boolean; pendingReviews: number; onNavigate?: () => void };

/** 左のメニュー。PC ではサイドバー、スマホではドロワーの中に表示する */
export function SideNav({ isAdmin, pendingReviews, onNavigate }: SideNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="メインメニュー" className="space-y-5">
      {sections(isAdmin, pendingReviews).map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted">{section.title}</p>}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.match(pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "bg-brand-soft text-brand-strong" : "text-foreground/80 hover:bg-surface hover:text-foreground"
                    }`}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-white">{item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
