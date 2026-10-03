"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "ホーム", match: (p: string) => p === "/" },
  { href: "/articles", label: "記事", match: (p: string) => p.startsWith("/articles") && !p.endsWith("/new") },
  { href: "/tags", label: "タグ", match: (p: string) => p.startsWith("/tags") },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="メインメニュー" className="flex items-center gap-1">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
