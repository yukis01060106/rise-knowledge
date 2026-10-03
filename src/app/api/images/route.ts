import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { getStorage } from "@/server/storage";
import { checkImage, MAX_IMAGE_BYTES } from "@/server/images/validate";
import { RATE_LIMIT_MESSAGE, takeToken } from "@/server/rate-limit";

/** 画像のアップロード。記事エディタから multipart/form-data（file）で送る */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!takeToken("imageUpload", user.id)) return NextResponse.json({ error: "rate_limited", message: RATE_LIMIT_MESSAGE }, { status: 429 });

  // 別サイトからのフォーム送信を拒否する
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 本文を読む前に、宣言されたサイズで大きすぎるものを弾く（multipart の分の余裕を持たせる）
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "too_large", message: "画像は 5MB 以下にしてください" }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "bad_request", message: "画像を送信できませんでした" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "bad_request", message: "画像を選んでください" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "too_large", message: "画像は 5MB 以下にしてください" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(bytes);
  if (!check.ok) {
    const status = check.code === "too_large" ? 413 : 415;
    return NextResponse.json({ error: check.code, message: check.message }, { status });
  }

  const id = randomUUID();
  const storageKey = `images/${id}`;
  await getStorage().put(storageKey, bytes, check.mimeType);
  await prisma.image.create({
    data: {
      id,
      uploaderId: user.id,
      storageKey,
      mimeType: check.mimeType,
      sizeBytes: bytes.byteLength,
      width: check.width,
      height: check.height,
    },
  });

  return NextResponse.json({ id, url: `/api/images/${id}` }, { status: 201 });
}
