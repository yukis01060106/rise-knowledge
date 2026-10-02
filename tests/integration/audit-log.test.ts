import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";

beforeEach(resetDb);

describe("監査ログは追記のみ", () => {
  it("UPDATE と DELETE は DB が拒否する", async () => {
    const user = await createUser();
    const log = await prisma.auditLog.create({
      data: { actorType: "system", action: "role_changed", targetUserId: user.id },
    });

    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { reason: "改ざん" } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow(/append-only/);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("監査ログに記録されたユーザーは削除できない", async () => {
    const user = await createUser();
    await prisma.auditLog.create({ data: { actorType: "system", action: "role_changed", targetUserId: user.id } });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
  });
});
