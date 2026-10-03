import { prisma } from "@/server/db";
import { parseTags } from "@/lib/tags";
import type { VersionStatus } from "@/generated/prisma/enums";

type Input = { title?: string; body?: string; tags?: string[]; publishedAt?: Date };

async function attachTags(versionId: string, tags: string[]) {
  const parsed = parseTags(tags);
  if (!parsed.ok) throw new Error(parsed.message);
  for (const t of parsed.tags) {
    const tag = await prisma.tag.upsert({ where: { name: t.name }, update: {}, create: t });
    await prisma.versionTag.create({ data: { versionId, tagId: tag.id } });
  }
}

/**
 * 公開済みの記事を DB に直接作る（承認フローはフェーズ 3 で作るため、テストではここで用意する）
 */
export async function createPublishedArticle(authorId: string, input: Input = {}) {
  const at = input.publishedAt ?? new Date();
  const article = await prisma.article.create({ data: { authorId } });
  const version = await prisma.articleVersion.create({
    data: {
      articleId: article.id,
      versionNo: 1,
      title: input.title ?? "公開記事",
      bodyMd: input.body ?? "本文",
      status: "published",
      createdBy: authorId,
    },
  });
  await attachTags(version.id, input.tags ?? []);
  await prisma.article.update({
    where: { id: article.id },
    data: { publishedVersionId: version.id, firstPublishedAt: at },
  });
  return { articleId: article.id, versionId: version.id };
}

/** 作業中の版だけを持つ（未公開の）記事を作る */
export async function createUnpublishedArticle(authorId: string, input: Input & { status?: VersionStatus } = {}) {
  const article = await prisma.article.create({ data: { authorId } });
  const version = await prisma.articleVersion.create({
    data: {
      articleId: article.id,
      versionNo: 1,
      title: input.title ?? "下書き",
      bodyMd: input.body ?? "下書きの本文",
      status: input.status ?? "draft",
      createdBy: authorId,
    },
  });
  await attachTags(version.id, input.tags ?? []);
  return { articleId: article.id, versionId: version.id };
}
