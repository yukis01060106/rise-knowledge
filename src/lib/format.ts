const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** 日付（Asia/Tokyo）。例：2026/10/03 */
export function formatDate(d: Date | null | undefined) {
  return d ? dateFormatter.format(d) : "-";
}

/** 日時（Asia/Tokyo）。例：2026/10/03 14:05 */
export function formatDateTime(d: Date | null | undefined) {
  return d ? dateTimeFormatter.format(d) : "-";
}
