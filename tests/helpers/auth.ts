import { vi } from "vitest";
import { auth } from "@/server/auth/config";

/** auth() が返すセッションを差し替える。null で未ログイン */
export function loginAs(user: { id: string } | null) {
  // NextAuth の auth はオーバーロードされているため、テストでは関数として扱う
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(
    user ? { user: { id: user.id }, expires: new Date(Date.now() + 3600_000).toISOString() } : null,
  );
}

function digestOf(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e ? String((e as { digest: unknown }).digest) : "";
}

/** redirect() で止まったこと（と行き先）を確かめる */
export async function expectRedirect(promise: Promise<unknown>, to: string) {
  try {
    await promise;
  } catch (e) {
    const digest = digestOf(e);
    if (digest.startsWith("NEXT_REDIRECT;") && digest.split(";")[2] === to) return;
    throw new Error(`redirect(${to}) を期待しましたが、別のエラーでした: ${digest || String(e)}`);
  }
  throw new Error(`redirect(${to}) を期待しましたが、正常に終了しました`);
}

/** forbidden()（403）で止まったことを確かめる */
export async function expectForbidden(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    if (digestOf(e) === "NEXT_HTTP_ERROR_FALLBACK;403") return;
    throw new Error(`forbidden() を期待しましたが、別のエラーでした: ${digestOf(e) || String(e)}`);
  }
  throw new Error("forbidden() を期待しましたが、正常に終了しました");
}
