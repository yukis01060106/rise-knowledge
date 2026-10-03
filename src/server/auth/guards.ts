import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { auth } from "./config";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, initials: true, department: true, role: true, disabledAt: true },
  });
}

/**
 * ログイン中のユーザーを DB から読み直して返す。未ログイン・無効化済みなら null。
 * ロールはセッションではなく DB の値を正とする（降格がすぐ反映されるように）。
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await loadUser(id);
  if (!user || user.disabledAt) return null;
  return user;
});

/** Server Component / Server Action / Route Handler の先頭で呼ぶ */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** admin 以外は 403 にする */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") forbidden();
  return user;
}
