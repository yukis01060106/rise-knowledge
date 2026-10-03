import "server-only";

/**
 * レート制限（直近 windowMs の回数で数える）。アプリのプロセスの中で数える簡易版。
 * 社内向けの 1 台構成を想定。台数を増やすときは、同じ人のリクエストが同じ台に行くようにするか、
 * DB などの共有の置き場に移す（docs/deploy.md）。
 */
export const LIMITS = {
  imageUpload: { max: 30, windowMs: 60_000 },
  preview: { max: 120, windowMs: 60_000 },
  comment: { max: 10, windowMs: 60_000 },
  like: { max: 60, windowMs: 60_000 },
  submitReview: { max: 10, windowMs: 60_000 },
  saveDraft: { max: 120, windowMs: 60_000 },
  devLogin: { max: 20, windowMs: 60_000 },
} as const;

export type LimitName = keyof typeof LIMITS;

const hits = new Map<string, number[]>();

/** 上限を超えていたら false。超えていなければ 1 回数えて true */
export function takeToken(name: LimitName, key: string, now = Date.now()): boolean {
  const { max, windowMs } = LIMITS[name];
  const id = `${name}:${key}`;
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(id, recent);
    return false;
  }
  recent.push(now);
  hits.set(id, recent);
  // 使われなくなったキーを時々掃除する
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

export const RATE_LIMIT_MESSAGE = "操作が多すぎます。少し時間をおいてからもう一度お試しください";

/** テスト用 */
export function resetRateLimits() {
  hits.clear();
}
