/** 月（日本時間）の扱い。"YYYY-MM" の文字列でやり取りする */

const tokyo = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" });

/** 日時が属する月（日本時間）。例：2026-10 */
export function monthOf(date: Date): string {
  return tokyo.format(date).slice(0, 7);
}

export function isMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** 月の始まりと次の月の始まり（UTC の Date。日本時間の 0 時） */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600_000);
  const end = new Date(Date.UTC(y, m, 1) - 9 * 3600_000);
  return { start, end };
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** monthly_awards.month（date 型）に入れる値 */
export function monthDate(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
