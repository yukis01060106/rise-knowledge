"use client";

import { useState, useTransition } from "react";
import { approveComment, deleteComment } from "@/server/social/actions";
import { buttonClass } from "@/components/ui/button";

export function CommentActions({ id }: { id: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => setMessage((await approveComment(id)).message ?? null))} className={buttonClass("secondary", "sm")}>
        問題なし
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm("このコメントを削除しますか？") && start(async () => setMessage((await deleteComment(id)).message ?? null))}
        className={buttonClass("danger", "sm")}
      >
        削除する
      </button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </div>
  );
}
