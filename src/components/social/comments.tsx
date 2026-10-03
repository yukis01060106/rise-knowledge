"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { deleteComment, postComment } from "@/server/social/actions";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { MAX_COMMENT_LENGTH } from "@/lib/articles";
import type { CommentView } from "@/server/social/queries";

const fmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function DeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm("このコメントを削除しますか？") && start(async () => void (await deleteComment(id)))}
      className="text-xs text-muted hover:text-danger"
    >
      削除
    </button>
  );
}

export function Comments({ articleId, comments }: { articleId: string; comments: CommentView[] }) {
  const [state, action, pending] = useActionState(postComment, null);
  const formRef = useRef<HTMLFormElement>(null);
  // 投稿に成功したら入力欄を空にする
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card space-y-5 p-5 sm:p-8" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="text-lg font-bold">
        コメント <span className="text-sm font-normal text-muted">{comments.filter((c) => !c.deleted).length}</span>
      </h2>
      {comments.length > 0 ? (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.author.name} department={c.author.department} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {c.author.profileId ? (
                    <Link href={`/users/${c.author.profileId}`} className="font-semibold text-foreground hover:text-brand">
                      {c.author.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground">{c.author.name}</span>
                  )}
                  <span>{fmt.format(c.createdAt)}</span>
                  {c.flagged && <span className="rounded bg-amber-100 px-1.5 text-amber-900">管理者が確認中</span>}
                  {c.canDelete && <DeleteButton id={c.id} />}
                </div>
                {c.deleted ? (
                  <p className="mt-1 text-sm text-muted italic">このコメントは削除されました</p>
                ) : (
                  // サニタイズ済みの HTML（renderMarkdown の出力）
                  <div className="markdown-body mt-1 rounded-xl bg-background px-4 py-3 text-sm" dangerouslySetInnerHTML={{ __html: c.html }} />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">まだコメントはありません。感想や補足、質問を書いてみましょう。</p>
      )}

      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="articleId" value={articleId} />
        <label htmlFor="comment-body" className="sr-only">
          コメント
        </label>
        <textarea
          id="comment-body"
          name="body"
          required
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="Markdown が使えます。客先名・パスワードなどの機密情報は書かないでください。"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {state && (
          <div role="status" className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            <p>{state.message}</p>
            {!state.ok && state.details && state.details.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {state.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md", "brand-gradient rounded-full px-5")}>
            {pending ? "確認して投稿中…" : "コメントする"}
          </button>
        </div>
      </form>
    </section>
  );
}
