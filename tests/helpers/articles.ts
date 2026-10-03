import { prisma } from "@/server/db";
import { parseTags } from "@/lib/tags";
import type { VersionStatus } from "@/generated/prisma/enums";

type Input = {
  title?: string;
  body?: string;
  tags?: string[];
  publishedAt?: Date;
  category?: "dev" | "infra" | "career" | null;
  facets?: string[];
};

/** draft から指定の状態まで、DB のトリガーが許す順に進める（テストの準備用） */
const PATH: Record<VersionStatus, VersionStatus[]> = {
  draft: [],
  ai_review: ["ai_review"],
  admin_review: ["ai_review", "admin_review"],
  published: ["ai_review", "admin_review", "published"],
  rejected: ["ai_review", "admin_review", "rejected"],
  superseded: ["ai_review", "admin_review", "published", "superseded"],
};

export async function advanceVersion(versionId: string, to: VersionStatus, data: { rejectReason?: string } = {}) {
  for (const status of PATH[to]) {
    await prisma.articleVersion.update({
      where: { id: versionId },
      data: {
        status,
        ...(status === "ai_review" && { submittedAt: new Date() }),
        ...(status === "rejected" && { rejectReason: data.rejectReason ?? "テストの差し戻し" }),
      },
    });
  }
}

async function createVersion(articleId: string, authorId: string, versionNo: number, input: Input) {
  const parsed = parseTags(input.tags ?? []);
  if (!parsed.ok) throw new Error(parsed.message);
  const version = await prisma.articleVersion.create({
    data: {
      articleId,
      versionNo,
      title: input.title ?? "記事",
      bodyMd: input.body ?? "本文",
      // 申請には大分類が必要なので、指定がなければ開発にする
      category: input.category === undefined ? "dev" : input.category,
      facets: input.facets ?? [],
      createdBy: authorId,
    },
  });
  for (const t of parsed.tags) {
    const tag = await prisma.tag.upsert({ where: { name: t.name }, update: {}, create: t });
    await prisma.versionTag.create({ data: { versionId: version.id, tagId: tag.id } });
  }
  return version;
}

/**
 * 公開済みの記事を DB に直接作る（承認フローのテスト以外で、公開記事を手早く用意するため）
 */
export async function createPublishedArticle(authorId: string, input: Input = {}) {
  const at = input.publishedAt ?? new Date();
  const article = await prisma.article.create({ data: { authorId } });
  const version = await createVersion(article.id, authorId, 1, { title: "公開記事", ...input });
  await advanceVersion(version.id, "published");
  await prisma.article.update({
    where: { id: article.id },
    data: { publishedVersionId: version.id, firstPublishedAt: at },
  });
  return { articleId: article.id, versionId: version.id };
}

/** 公開されていない記事を作る（状態を指定すると、その状態まで進める） */
export async function createUnpublishedArticle(authorId: string, input: Input & { status?: VersionStatus } = {}) {
  const article = await prisma.article.create({ data: { authorId } });
  const version = await createVersion(article.id, authorId, 1, { title: "下書き", body: "下書きの本文", ...input });
  if (input.status) await advanceVersion(version.id, input.status);
  return { articleId: article.id, versionId: version.id };
}

/** 既存の記事に新しい版を足す（公開後の編集・差し戻し後の修正の準備用） */
export async function addVersion(articleId: string, input: Input & { status?: VersionStatus } = {}) {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  const last = await prisma.articleVersion.aggregate({ where: { articleId }, _max: { versionNo: true } });
  const version = await createVersion(articleId, article.authorId, (last._max.versionNo ?? 0) + 1, input);
  if (input.status) await advanceVersion(version.id, input.status);
  return { versionId: version.id };
}
