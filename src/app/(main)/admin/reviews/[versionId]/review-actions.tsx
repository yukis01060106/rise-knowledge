"use client";

import { useActionState, useState } from "react";
import { approveAction, rejectAction } from "@/server/workflow/actions";
import { buttonClass } from "@/components/ui/button";
import { MAX_REASON_LENGTH } from "@/lib/articles";

export function ReviewActions({ versionId }: { versionId: string }) {
  const [approveState, approve, approving] = useActionState(approveAction, null);
  const [rejectState, reject, rejecting] = useActionState(rejectAction, null);
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const error = approveState ?? rejectState;
  const pending = approving || rejecting;

  return (
    <div className="space-y-3">
      {error && !error.ok && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error.message}
        </p>
      )}
      {mode === "reject" ? (
        <form action={reject} className="space-y-2">
          <input type="hidden" name="versionId" value={versionId} />
          <label htmlFor="reject-reason" className="block text-sm font-semibold">
            差し戻しの理由（著者に表示されます）
          </label>
          <textarea
            id="reject-reason"
            name="reason"
            required
            maxLength={MAX_REASON_LENGTH}
            rows={5}
            placeholder="例：3 行目のホスト名が客先のものと思われます。伏せてから再申請してください。"
            className="w-full rounded-md border border-border p-2 text-sm focus:border-brand focus:outline-none"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className={buttonClass("danger")}>
              {rejecting ? "送信中…" : "差し戻す"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={buttonClass("ghost")}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form
            action={approve}
            onSubmit={(e) => {
              if (!confirm("この版を承認して公開しますか？")) e.preventDefault();
            }}
          >
            <input type="hidden" name="versionId" value={versionId} />
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {approving ? "公開中…" : "承認して公開"}
            </button>
          </form>
          <button type="button" onClick={() => setMode("reject")} disabled={pending} className={buttonClass("danger")}>
            差し戻す
          </button>
        </div>
      )}
    </div>
  );
}
