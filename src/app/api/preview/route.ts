import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/guards";
import { renderMarkdown } from "@/server/markdown/render";
import { MAX_BODY_LENGTH } from "@/lib/articles";

const schema = z.object({ markdown: z.string().max(MAX_BODY_LENGTH) });

/**
 * エディタのプレビュー。記事表示と同じ変換（サニタイズ込み）をサーバーで行う。
 * 読み取りだけなので Server Action ではなく Route Handler にする（自動保存の Action を待たせない）。
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  return NextResponse.json({ html: await renderMarkdown(parsed.data.markdown) });
}
