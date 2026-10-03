"use client";

import { useEffect } from "react";
import { markAllNotificationsRead } from "@/server/insights/actions";

/** 通知の一覧を開いたら、少し待ってから既読にする（未読の印は表示されたまま） */
export function MarkReadOnView({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    const t = setTimeout(() => void markAllNotificationsRead(), 1500);
    return () => clearTimeout(t);
  }, [hasUnread]);
  return null;
}
