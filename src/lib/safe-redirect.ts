/** ログイン後の戻り先。サイト内の相対パスだけを許可する（オープンリダイレクト対策） */
export function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
