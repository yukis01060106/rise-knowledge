/**
 * セキュリティ用の HTTP ヘッダー（next.config.ts から全ページに付ける）。
 * - CSP：外部のスクリプト・画像・フレームを読まない。記事の画像はアプリ経由（/api/images）だけ
 * - form-action：SSO の画面（Google・Microsoft）へのリダイレクトを許可する（Chrome はリダイレクト先にも適用する）
 * - Next.js のインラインスクリプトのため script-src に 'unsafe-inline' が必要。開発時は 'unsafe-eval' も
 */
export function securityHeaders(isDev: boolean) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com https://login.microsoftonline.com",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    // 社内限定のサイトなので検索エンジンに載せない（robots メタタグと二重に）
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}
