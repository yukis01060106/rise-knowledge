import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/server/markdown/render";

describe("Markdown の変換とサニタイズ", () => {
  it("見出し・表・コードを HTML にし、コードはハイライトする", async () => {
    const html = await renderMarkdown("# 手順\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```\n");
    expect(html).toContain("<h1>手順</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain('class="shiki github-light"');
    expect(html).toContain("const");
  });

  it("生の HTML（script・イベント属性・iframe）は出力しない", async () => {
    const html = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n<a href="#" onclick="alert(1)">x</a>',
    );
    expect(html).not.toMatch(/<script|onerror|onclick|<iframe/i);
  });

  it("javascript: や data: のリンクは href を落とす", async () => {
    const html = await renderMarkdown("[a](javascript:alert(1)) [b](data:text/html,<script>alert(1)</script>) [c](JaVaScRiPt:alert(1))");
    expect(html).not.toMatch(/href="(javascript|data):/i);
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("外部リンクは別タブ・noopener で開く", async () => {
    const html = await renderMarkdown("[公式](https://example.com/docs)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("画像はアップロード画像だけ表示し、外部の画像は置き換える", async () => {
    const id = "0b0f7c1e-2b7a-4a35-9c39-1f0f3f3c9a11";
    const html = await renderMarkdown(`![ok](/api/images/${id})\n\n![ng](https://tracker.example/pixel.png)\n\n![ng2](/api/images/../admin)`);
    expect(html).toContain(`src="/api/images/${id}"`);
    expect(html).not.toContain("tracker.example");
    expect(html).not.toContain("/api/images/../admin");
    expect(html).toContain("外部の画像は表示できません");
  });

  it("コードブロック内の HTML はエスケープされる", async () => {
    const html = await renderMarkdown("```html\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#x3C;");
  });

  it("未知の言語のコードブロックでもエラーにしない", async () => {
    const html = await renderMarkdown("```unknownlang\nfoo\n```");
    expect(html).toContain("foo");
  });
});
