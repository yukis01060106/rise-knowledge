/** 一覧に出す本文の抜粋。Markdown の記号・コードブロック・URL を除いた先頭の文章 */
export function excerptOf(markdown: string, length = 90): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/** 読むのにかかる時間の目安（分）。日本語は 1 分あたり 500 文字ほど */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(markdown.length / 500));
}
