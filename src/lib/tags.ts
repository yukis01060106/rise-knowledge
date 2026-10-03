/** 1 つの版に付けられるタグの上限 */
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;

// 英数字・日本語（ひらがな・カタカナ・漢字・長音）と . _ - + # だけを許す（URL に使うため空白や / は不可）
const TAG_PATTERN = /^[\p{L}\p{N}ー._+#-]+$/u;

/** タグの表記を正規化する（全角英数を半角に、小文字に）。同じタグかどうかはこの値で判定する */
export function normalizeTagName(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export type ParsedTags = { ok: true; tags: { name: string; displayName: string }[] } | { ok: false; message: string };

/** 入力されたタグ（空白・カンマ区切り）を検証し、重複を除いて返す */
export function parseTags(input: readonly string[]): ParsedTags {
  const seen = new Map<string, string>();
  for (const raw of input.flatMap((s) => s.split(/[\s,、]+/))) {
    const displayName = raw.normalize("NFKC").trim();
    if (!displayName) continue;
    if (displayName.length > MAX_TAG_LENGTH) {
      return { ok: false, message: `タグは ${MAX_TAG_LENGTH} 文字以内にしてください` };
    }
    if (!TAG_PATTERN.test(displayName)) {
      return { ok: false, message: "タグに使えるのは英数字・日本語と . _ - + # だけです" };
    }
    const name = normalizeTagName(displayName);
    if (!seen.has(name)) seen.set(name, displayName);
  }
  if (seen.size > MAX_TAGS) return { ok: false, message: `タグは ${MAX_TAGS} 個までです` };
  return { ok: true, tags: [...seen].map(([name, displayName]) => ({ name, displayName })) };
}
