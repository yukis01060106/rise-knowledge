"use client";

import { useActionState } from "react";
import { giveAward } from "@/server/insights/actions";
import { buttonClass } from "@/components/ui/button";

export function AwardForm({ month, articleId }: { month: string; articleId: string }) {
  const [state, action, pending] = useActionState(giveAward, null);
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        if (!confirm("この記事を月間ベストに選びますか？著者に通知されます")) e.preventDefault();
      }}
    >
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="articleId" value={articleId} />
      <input name="comment" maxLength={300} placeholder="選んだ理由・ひとこと（任意）" className="min-w-0 flex-1 rounded-md border border-border px-2 py-1 text-sm" />
      <button type="submit" disabled={pending} className={buttonClass("primary", "sm", "bg-gradient-to-r from-amber-400 to-orange-500")}>
        🏆 表彰する
      </button>
      {state && <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-danger"}`}>{state.message}</span>}
    </form>
  );
}
