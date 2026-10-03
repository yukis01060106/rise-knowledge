import "server-only";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { defaultSchema, type Schema } from "hast-util-sanitize";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";

/** サニタイズ済みの HTML 文字列。dangerouslySetInnerHTML にはこの型の値だけを渡す */
export type SanitizedHtml = string & { readonly __brand: "SanitizedHtml" };

/** アップロード画像の URL（アプリ経由の配信。外部の画像は表示しない） */
const IMAGE_SRC_PATTERN = /^\/api\/images\/[0-9a-f-]{36}$/;

const HIGHLIGHT_LANGS = [
  "bash", "shellscript", "powershell", "bat", "javascript", "typescript", "jsx", "tsx", "json", "jsonc",
  "yaml", "toml", "ini", "xml", "html", "css", "scss", "markdown", "sql", "python", "java", "kotlin",
  "go", "rust", "c", "cpp", "csharp", "php", "ruby", "swift", "dockerfile", "hcl", "terraform", "nginx",
  "diff", "log", "vue", "graphql", "groovy", "vb",
] as const;

/**
 * 許可リスト方式のサニタイズ設定。GitHub 相当の既定値から、さらに絞る。
 * - 生の HTML はそもそも remark-rehype で捨てる（allowDangerousHtml を付けない）
 * - リンクは http / https / mailto と相対パスだけ
 */
const sanitizeSchema: Schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: [],
  },
};

/** 画像はアップロード画像だけを表示し、外部 URL は文言に置き換える。外部リンクは別タブ・リファラなしで開く */
function rehypeRestrictMedia() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName === "img") {
        const src = typeof node.properties.src === "string" ? node.properties.src : "";
        if (!IMAGE_SRC_PATTERN.test(src)) {
          if (parent && index !== undefined) {
            parent.children[index] = {
              type: "element",
              tagName: "span",
              properties: { className: ["blocked-image"] },
              children: [{ type: "text", value: "［外部の画像は表示できません］" }],
            };
          }
          return;
        }
        node.properties.loading = "lazy";
      }
      if (node.tagName === "a") {
        const href = typeof node.properties.href === "string" ? node.properties.href : "";
        if (/^https?:\/\//i.test(href)) {
          node.properties.target = "_blank";
          node.properties.rel = ["noopener", "noreferrer", "nofollow"];
        }
      }
    });
  };
}

async function createProcessor() {
  const highlighter = await createHighlighter({
    themes: ["github-light"],
    langs: [...HIGHLIGHT_LANGS],
    // WASM を使わない正規表現エンジン（サーバーレス環境でもそのまま動く）
    engine: createJavaScriptRegexEngine(),
  });
  return (
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize, sanitizeSchema)
      // ハイライトはサニタイズの後。Shiki はコードをエスケープした span を出すだけなので安全
      .use(rehypeShikiFromHighlighter, highlighter, { theme: "github-light", fallbackLanguage: "text" })
      .use(rehypeRestrictMedia)
      .use(rehypeStringify)
      .freeze()
  );
}

let processorPromise: ReturnType<typeof createProcessor> | undefined;

/** Markdown をサニタイズ済みの HTML に変換する。プレビューと記事表示の両方でこれを使う */
export async function renderMarkdown(markdown: string): Promise<SanitizedHtml> {
  processorPromise ??= createProcessor();
  const processor = await processorPromise;
  const file = await processor.process(markdown);
  return String(file) as SanitizedHtml;
}
