import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { getStorage } from "@/server/storage";

/**
 * 画像の配信。ストレージの URL は外に出さず、ログインを確認してからアプリ経由で返す
 * （社外の人が URL を知っても見られないように）。
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/images/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const image = await prisma.image.findUnique({
    where: { id: parsed.data },
    select: { storageKey: true, mimeType: true },
  });
  if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await getStorage().get(image.storageKey);
  if (!body) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // ログインした本人のブラウザにだけキャッシュさせる（共有キャッシュには載せない）
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
