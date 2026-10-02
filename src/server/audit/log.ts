import "server-only";
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db";

type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  articleId?: string;
  versionId?: string;
  commentId?: string;
  targetUserId?: string;
  reason?: string;
  /** 記事本文や秘密情報は入れない。ID や変更前後の値など */
  metadata?: Prisma.InputJsonValue;
};

/** 監査ログを追記する。対象の変更と同じトランザクションの中で呼ぶこと */
export async function writeAuditLog(tx: Tx, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      ...entry,
      actorType: entry.actorId ? "user" : "system",
    },
  });
}
