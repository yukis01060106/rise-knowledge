import { beforeEach, describe, expect, it } from "vitest";
import { changeUserRole, setUserDisabled, updateMyDepartment } from "@/server/users/actions";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { expectForbidden, expectRedirect, loginAs } from "../helpers/auth";

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

beforeEach(resetDb);

describe("ロール変更（Server Action）", () => {
  it("未ログインでは実行できない", async () => {
    const target = await createUser();
    loginAs(null);
    await expectRedirect(changeUserRole(null, form({ userId: target.id, role: "admin" })), "/login");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("member");
  });

  it("member は admin への昇格を実行できない（自分自身の昇格も含む）", async () => {
    const member = await createUser();
    const other = await createUser();
    loginAs(member);

    await expectForbidden(changeUserRole(null, form({ userId: other.id, role: "admin" })));
    await expectForbidden(changeUserRole(null, form({ userId: member.id, role: "admin" })));

    const roles = await prisma.user.findMany({ select: { role: true } });
    expect(roles.every((u) => u.role === "member")).toBe(true);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("admin は member を昇格でき、監査ログが残る", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    loginAs(admin);

    const result = await changeUserRole(null, form({ userId: target.id, role: "admin" }));
    expect(result).toMatchObject({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("admin");

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorId: admin.id,
      actorType: "user",
      action: "role_changed",
      targetUserId: target.id,
      metadata: { from: "member", to: "admin" },
    });
  });

  it("admin でも自分自身のロールは変更できない", async () => {
    const admin = await createUser({ role: "admin" });
    loginAs(admin);
    const result = await changeUserRole(null, form({ userId: admin.id, role: "member" }));
    expect(result).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("admin");
  });

  it("不正な入力は拒否する", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    loginAs(admin);
    expect(await changeUserRole(null, form({ userId: target.id, role: "owner" }))).toMatchObject({ ok: false });
    expect(await changeUserRole(null, form({ userId: "not-a-uuid", role: "admin" }))).toMatchObject({ ok: false });
  });
});

describe("ユーザーの無効化（Server Action）", () => {
  it("member は実行できない", async () => {
    const member = await createUser();
    const other = await createUser();
    loginAs(member);
    await expectForbidden(setUserDisabled(null, form({ userId: other.id, disabled: "true" })));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).disabledAt).toBeNull();
  });

  it("admin が無効化するとセッションが消え、監査ログが残る", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    await prisma.session.create({
      data: { sessionToken: "t1", userId: target.id, expires: new Date(Date.now() + 3600_000) },
    });
    loginAs(admin);

    const result = await setUserDisabled(null, form({ userId: target.id, disabled: "true", reason: "退職" }));
    expect(result).toMatchObject({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).disabledAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.auditLog.findFirst()).toMatchObject({ action: "user_disabled", reason: "退職" });
  });

  it("自分自身は無効化できない", async () => {
    const admin = await createUser({ role: "admin" });
    loginAs(admin);
    expect(await setUserDisabled(null, form({ userId: admin.id, disabled: "true" }))).toMatchObject({ ok: false });
  });
});

describe("所属の初回設定（Server Action）", () => {
  it("未ログインでは実行できない", async () => {
    loginAs(null);
    await expectRedirect(updateMyDepartment(null, form({ department: "dev" })), "/login");
  });

  it("自分の所属を登録してトップへ進む", async () => {
    const user = await createUser({ department: null });
    loginAs(user);
    await expectRedirect(updateMyDepartment(null, form({ department: "infra" })), "/");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).department).toBe("infra");
  });

  it("選択肢にない値は拒否する", async () => {
    const user = await createUser({ department: null });
    loginAs(user);
    expect(await updateMyDepartment(null, form({ department: "sales" }))).toMatchObject({ ok: false });
  });
});
