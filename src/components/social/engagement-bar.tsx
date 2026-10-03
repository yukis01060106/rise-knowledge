"use client";

import { useState, useTransition } from "react";
import { toggleLike, toggleStock } from "@/server/social/actions";

type Props = { articleId: string; likeCount: number; liked: boolean; stocked: boolean; canLike: boolean };

/** いいね・ストック。押したらすぐ表示を変え、サーバーの結果で確定する */
export function EngagementBar(props: Props) {
  const [liked, setLiked] = useState(props.liked);
  const [count, setCount] = useState(props.likeCount);
  const [stocked, setStocked] = useState(props.stocked);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const like = () =>
    start(async () => {
      setMessage(null);
      setLiked(!liked);
      setCount((c) => c + (liked ? -1 : 1));
      const r = await toggleLike(props.articleId);
      if (r.ok) {
        setLiked(Boolean(r.liked));
        setCount(r.count ?? 0);
      } else {
        setLiked(liked);
        setCount(props.likeCount);
        setMessage(r.message);
      }
    });

  const stock = () =>
    start(async () => {
      setStocked(!stocked);
      const r = await toggleStock(props.articleId);
      if (r.ok) setStocked(Boolean(r.stocked));
      else {
        setStocked(stocked);
        setMessage(r.message);
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={like}
        disabled={pending || !props.canLike}
        aria-pressed={liked}
        title={props.canLike ? undefined : "自分の記事にはいいねできません"}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
          liked ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow" : "bg-surface ring-1 ring-border hover:ring-pink-300"
        } ${!props.canLike ? "opacity-60" : ""}`}
      >
        <span aria-hidden>{liked ? "♥" : "♡"}</span> いいね <span className="tabular-nums">{count}</span>
      </button>
      <button
        type="button"
        onClick={stock}
        disabled={pending}
        aria-pressed={stocked}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
          stocked ? "brand-gradient text-white shadow" : "bg-surface ring-1 ring-border hover:ring-brand"
        }`}
      >
        <span aria-hidden>{stocked ? "★" : "☆"}</span> {stocked ? "ストック済み" : "ストック"}
      </button>
      {message && <span className="text-xs text-danger">{message}</span>}
    </div>
  );
}
