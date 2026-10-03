"use client";

import { useActionState, useState } from "react";
import { setArticleHiddenAction } from "@/server/workflow/actions";
import { buttonClass } from "@/components/ui/button";
import { MAX_REASON_LENGTH } from "@/lib/articles";

/** 緊急非公開・再公開（理由必須） */
export function HideToggle({ articleId, hidden, canUnhide }: { articleId: string; hidden: boolean; canUnhide: boolean }) {
  const [state, action, pending] = useActionState(setArticleHiddenAction, null);
  const [open, setOpen] = useState(false);

  if (hidden && !canUnhide) return <span className="text-xs text-muted">自分の記事は再公開できません</span>;

  return (
    <div className="space-y-1">
      {open ? (
        <form action={action} className="flex flex-col gap-1.5 sm:w-72">
          <input type="hidden" name="articleId" value={articleId} />
          <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
          <textarea
            name="reason"
            required
            maxLength={MAX_REASON_LENGTH}
            rows={2}
            placeholder={hidden ? "再公開の理由" : "非公開にする理由（著者に表示されます）"}
            className="rounded-md border border-border p-1.5 text-sm"
          />
          <div className="flex gap-1.5">
            <button type="submit" disabled={pending} className={buttonClass(hidden ? "primary" : "danger", "sm")}>
              {hidden ? "再公開する" : "非公開にする"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass(hidden ? "secondary" : "danger", "sm")}>
          {hidden ? "再公開" : "緊急非公開"}
        </button>
      )}
      {state && (
        <p role="status" className={`text-xs ${state.ok ? "text-emerald-700" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
