"use client";

import { useState, useTransition } from "react";
import { toggleFollowTag } from "@/server/social/actions";

export function FollowTagButton({ tagName, following: initial }: { tagName: string; following: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={following}
      onClick={() =>
        start(async () => {
          setFollowing(!following);
          const r = await toggleFollowTag(tagName);
          setFollowing(r.ok ? Boolean(r.following) : following);
        })
      }
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        following ? "bg-white/90 text-brand-strong" : "bg-white/20 text-white ring-1 ring-white/60 hover:bg-white/30"
      }`}
    >
      {following ? "✓ フォロー中" : "＋ フォローする"}
    </button>
  );
}
