import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security-headers";

/** ソースコードを読んで、開発ルール（CLAUDE.md）が守られているかを確かめる。新しいファイルを足したときの抜け漏れ防止 */

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (p.includes("generated")) continue;
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const src = files("src");
const read = (p: string) => readFileSync(p, "utf8");

describe("権限チェックの抜け漏れ", () => {
  it("Server Action（use server）はすべて先頭で requireUser / requireAdmin を呼ぶ（ログイン・ログアウトを除く）", () => {
    const missing: string[] = [];
    for (const f of src.filter((p) => read(p).startsWith('"use server"'))) {
      const s = read(f);
      for (const m of s.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{/g)) {
        if (["loginAction", "logoutAction"].includes(m[1])) continue;
        const head = s.slice(m.index! + m[0].length, m.index! + m[0].length + 300);
        if (!/require(User|Admin)\(\)/.test(head)) missing.push(`${f}:${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("画面（page.tsx）はすべてサーバー側でログインを確認する", () => {
    const pages = src.filter((p) => p.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThan(15);
    expect(pages.filter((p) => !/requireUser\(|requireAdmin\(|getCurrentUser\(/.test(read(p)))).toEqual([]);
  });

  it("管理画面（/admin 以下）は requireAdmin を呼ぶ", () => {
    const admin = src.filter((p) => p.includes(`${path.sep}admin${path.sep}`) && p.endsWith("page.tsx"));
    expect(admin.filter((p) => !read(p).includes("requireAdmin(")) ).toEqual([]);
  });

  it("Route Handler はログインを確認する（Auth.js 本体と開発用ログインを除く）", () => {
    const routes = src.filter((p) => p.endsWith("route.ts") && !p.includes("[...nextauth]") && !p.includes("dev-login"));
    expect(routes.filter((p) => !/getCurrentUser\(|requireUser\(/.test(read(p)))).toEqual([]);
  });
});

describe("インジェクション・XSS の対策", () => {
  it("生 SQL は タグ付きテンプレートだけ（$queryRawUnsafe / $executeRawUnsafe を使わない）", () => {
    expect(src.filter((p) => /\$(query|execute)RawUnsafe/.test(read(p)))).toEqual([]);
  });

  it("dangerouslySetInnerHTML はサニタイズ済み HTML を表示する決まったファイルだけ", () => {
    const allowed = [
      "src/app/(main)/articles/[id]/page.tsx",
      "src/app/(main)/admin/comments/page.tsx",
      "src/app/(main)/admin/articles/[id]/versions/page.tsx",
      "src/app/(main)/admin/reviews/[versionId]/page.tsx",
      "src/components/articles/article-editor.tsx",
      "src/components/social/comments.tsx",
    ].map((p) => path.normalize(p));
    const used = src.filter((p) => read(p).includes("dangerouslySetInnerHTML=")).map((p) => path.normalize(p));
    expect(used.filter((p) => !allowed.includes(p))).toEqual([]);
  });

  it("LLM への記事は <article> タグで渡し、システムプロンプトに本文を混ぜない", () => {
    const reviewer = read("src/server/compliance/reviewer.ts");
    expect(reviewer).toContain("<article>");
    expect(reviewer).toMatch(/system: \[\{ type: "text", text: loadSystemPrompt\(\)/);
  });
});

describe("ログに本文・秘密情報を出さない", () => {
  it("console に出すのは ID・件数・エラーコードだけ（本文・タイトル・メール・トークンらしき変数を出さない）", () => {
    const bad: string[] = [];
    for (const f of src) {
      for (const line of read(f).split("\n")) {
        if (!/console\.(log|info|warn|error)/.test(line)) continue;
        if (/\$\{[^}]*(body|bodyMd|title|email|token|password|content|prompt|payload)\b/i.test(line)) bad.push(`${f}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("セキュリティヘッダー", () => {
  it("本番では外部の読み込み・フレーム埋め込みを禁止し、HSTS を付ける", () => {
    const h = Object.fromEntries(securityHeaders(false).map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(h["Content-Security-Policy"]).toMatch(/img-src 'self' data: blob:(;|$)/);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toContain("max-age");
    expect(h["X-Robots-Tag"]).toContain("noindex");
  });
});
