import "server-only";
import { imageSize } from "image-size";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8000;

/** 受け付ける画像形式。SVG はスクリプトを含められるため受け付けない */
const FORMATS = {
  png: { mime: "image/png", magic: (b: Uint8Array) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", magic: (b: Uint8Array) => startsWith(b, [0xff, 0xd8, 0xff]) },
  gif: { mime: "image/gif", magic: (b: Uint8Array) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  webp: {
    mime: "image/webp",
    magic: (b: Uint8Array) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
} as const;

export type ImageMime = (typeof FORMATS)[keyof typeof FORMATS]["mime"];

function startsWith(bytes: Uint8Array, sig: readonly number[]) {
  return bytes.length >= sig.length && sig.every((v, i) => bytes[i] === v);
}

export type ImageCheck =
  | { ok: true; mimeType: ImageMime; width: number; height: number }
  | { ok: false; code: "too_large" | "unsupported_format" | "invalid_image" | "too_many_pixels"; message: string };

/**
 * アップロードされた画像を検証する。拡張子や Content-Type は信用せず、ファイルの中身（先頭のバイト）で判定する。
 */
export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, code: "too_large", message: "画像は 5MB 以下にしてください" };
  }
  const entry = Object.entries(FORMATS).find(([, f]) => f.magic(bytes));
  if (!entry) {
    return { ok: false, code: "unsupported_format", message: "PNG・JPEG・GIF・WebP の画像だけアップロードできます" };
  }
  const [type, format] = entry;

  let size: ReturnType<typeof imageSize>;
  try {
    size = imageSize(bytes);
  } catch {
    return { ok: false, code: "invalid_image", message: "画像ファイルを読み取れませんでした" };
  }
  // 先頭のバイトと中身の形式が食い違うファイルは受け付けない
  if (size.type !== type || !size.width || !size.height) {
    return { ok: false, code: "invalid_image", message: "画像ファイルを読み取れませんでした" };
  }
  if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
    return { ok: false, code: "too_many_pixels", message: `画像の縦横は ${MAX_IMAGE_DIMENSION}px 以下にしてください` };
  }
  return { ok: true, mimeType: format.mime, width: size.width, height: size.height };
}
