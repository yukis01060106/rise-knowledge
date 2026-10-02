import { beforeEach, describe, expect, it } from "vitest";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import AdminUsersPage from "@/app/(main)/admin/users/page";
import HomePage from "@/app/(main)/page";
import { createUser, resetDb } from "../helpers/db";
import { expectForbidden, expectRedirect, loginAs } from "../helpers/auth";

beforeEach(resetDb);

describe("未ログインのアクセス拒否", () => {
  it("requireUser はログイン画面へリダイレクトする", async () => {
    loginAs(null);
    await expectRedirect(requireUser(), "/login");
  });

  it("トップページ・管理画面はログイン画面へリダイレクトする", async () => {
    loginAs(null);
    await expectRedirect(HomePage(), "/login");
    await expectRedirect(AdminUsersPage(), "/login");
  });

  it("DB にないユーザーのセッションは未ログイン扱い", async () => {
    loginAs({ id: "00000000-0000-4000-8000-000000000000" });
    await expectRedirect(requireUser(), "/login");
  });

  it("無効化されたユーザーは未ログイン扱い", async () => {
    const user = await createUser({ disabledAt: new Date() });
    loginAs(user);
    await expectRedirect(requireUser(), "/login");
  });
});

describe("member は admin 機能に触れない", () => {
  it("requireAdmin は member を 403 にする", async () => {
    const member = await createUser({ role: "member" });
    loginAs(member);
    await expectForbidden(requireAdmin());
  });

  it("ユーザー管理画面は member に 403 を返す", async () => {
    const member = await createUser({ role: "member" });
    loginAs(member);
    await expectForbidden(AdminUsersPage());
  });

  it("admin は通る", async () => {
    const admin = await createUser({ role: "admin" });
    loginAs(admin);
    await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id, role: "admin" });
  });

  it("降格はセッションを作り直さなくてもすぐ反映される（ロールは毎回 DB から読む）", async () => {
    const admin = await createUser({ role: "admin" });
    loginAs(admin);
    await requireAdmin();
    await prisma.user.update({ where: { id: admin.id }, data: { role: "member" } });
    await expectForbidden(requireAdmin());
  });
});
