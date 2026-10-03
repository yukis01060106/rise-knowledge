"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SideNav, type SideNavProps } from "./side-nav";

/** スマホ用：ハンバーガーボタンと、右から出るメニュー */
export function MobileNav(props: Omit<SideNavProps, "onNavigate">) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="メニューを開く"
        aria-expanded={open}
        className="-mr-1 rounded-md p-1.5 text-foreground hover:bg-background lg:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="size-6"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {/* ヘッダーの backdrop-filter の中だと fixed がヘッダーの範囲に閉じ込められるため、body 直下に描く */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-30 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="メニュー"
          >
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-background p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-strong">メニュー</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="メニューを閉じる"
                  className="rounded-md p-1.5 hover:bg-surface"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="size-5"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <form
                action="/search"
                role="search"
                onSubmit={() => setOpen(false)}
              >
                <label htmlFor="drawer-search" className="sr-only">
                  記事を検索
                </label>
                <input
                  id="drawer-search"
                  name="q"
                  type="search"
                  placeholder="記事を検索"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </form>
              <SideNav {...props} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
