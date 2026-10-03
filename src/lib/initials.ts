/** イニシャルの文字数（アルファベットの数）の上限 */
export const MAX_INITIALS_LETTERS = 4;

export type ParsedInitials = { ok: true; value: string } | { ok: false; message: string };

/**
 * 入力されたイニシャルを「K.T.」の形にそろえる。全角・小文字・区切りの有無は問わない（例：kt、Ｋ．Ｔ → K.T.）。
 * アルファベット以外（漢字・数字など）は受け付けない（実名がそのまま出るのを防ぐ）。
 */
export function parseInitials(input: string): ParsedInitials {
  const normalized = input.normalize("NFKC").toUpperCase().replace(/[\s.・]/g, "");
  if (!normalized) return { ok: false, message: "イニシャルを入力してください" };
  if (!/^[A-Z]+$/.test(normalized)) return { ok: false, message: "イニシャルはアルファベットで入力してください（例：K.T.）" };
  if (normalized.length > MAX_INITIALS_LETTERS) {
    return { ok: false, message: `イニシャルは ${MAX_INITIALS_LETTERS} 文字までです` };
  }
  return { ok: true, value: `${[...normalized].join(".")}.` };
}
