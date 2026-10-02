/**
 * メールアドレスのドメインが許可リストに完全一致するか。
 * サブドメインは許可しない（必要なら AUTH_ALLOWED_DOMAINS に明示する）。
 */
export function isAllowedEmail(email: string | null | undefined, allowedDomains: readonly string[]) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at !== normalized.indexOf("@")) return false;
  const domain = normalized.slice(at + 1);
  return allowedDomains.includes(domain);
}
