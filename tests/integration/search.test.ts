import { beforeEach, describe, expect, it } from "vitest";
import { searchPublishedArticles, splitSearchTerms } from "@/server/articles/queries";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { createPublishedArticle, createUnpublishedArticle } from "../helpers/articles";

beforeEach(resetDb);

async function titlesFor(q: string) {
  return (await searchPublishedArticles(q)).items.map((a) => a.title).sort();
}

describe("全文検索（pg_bigm）", () => {
  beforeEach(async () => {
    const user = await createUser();
    await createPublishedArticle(user.id, {
      title: "Terraform の状態ファイルを管理する",
      body: "リモートバックエンドに S3 を使い、ロックには DynamoDB を使います。",
      tags: ["Terraform", "AWS"],
    });
    await createPublishedArticle(user.id, {
      title: "Linux のディスク容量を調べる",
      body: "df と du で原因を探します。ログのローテーションも確認。",
      tags: ["Linux"],
    });
    await createUnpublishedArticle(user.id, { title: "下書き：状態管理の話", body: "状態ファイルの下書き" });
  });

  it("日本語の部分一致でタイトル・本文を探せる", async () => {
    expect(await titlesFor("状態ファイル")).toEqual(["Terraform の状態ファイルを管理する"]);
    expect(await titlesFor("ローテーション")).toEqual(["Linux のディスク容量を調べる"]);
    // 1 文字でも探せる
    expect(await titlesFor("容")).toEqual(["Linux のディスク容量を調べる"]);
  });

  it("英字は大文字・小文字を区別しない", async () => {
    expect(await titlesFor("dynamodb")).toEqual(["Terraform の状態ファイルを管理する"]);
    expect(await titlesFor("LINUX")).toEqual(["Linux のディスク容量を調べる"]);
  });

  it("空白区切りの複数語は、すべてを含む記事だけ（全角空白も区切り）", async () => {
    expect(await titlesFor("S3　ロック")).toEqual(["Terraform の状態ファイルを管理する"]);
    expect(await titlesFor("S3 ディスク")).toEqual([]);
  });

  it("タグ名でも探せる", async () => {
    expect(await titlesFor("aws")).toEqual(["Terraform の状態ファイルを管理する"]);
  });

  it("下書きや、公開記事の編集中の版は検索に出ない", async () => {
    expect(await titlesFor("下書き")).toEqual([]);

    const article = await prisma.article.findFirstOrThrow({ where: { publishedVersionId: { not: null } } });
    await prisma.articleVersion.create({
      data: { articleId: article.id, versionNo: 2, title: "編集中だけの言葉ほげ", bodyMd: "", createdBy: article.authorId },
    });
    expect(await titlesFor("ほげ")).toEqual([]);
  });

  it("LIKE の特殊文字（% や _）はそのままの文字として扱う", async () => {
    expect(await titlesFor("%")).toEqual([]);
    expect(await titlesFor("_")).toEqual([]);
  });

  it("SQL として解釈される文字列を入れても安全", async () => {
    expect(await titlesFor("'; DROP TABLE articles; --")).toEqual([]);
    expect(await prisma.article.count()).toBe(3);
  });

  it("空の検索語は 0 件", async () => {
    expect((await searchPublishedArticles("   ")).total).toBe(0);
  });
});

describe("検索語の分割", () => {
  it("全角空白で区切り、最大 5 語まで", () => {
    expect(splitSearchTerms("a　b  c d e f g")).toEqual(["a", "b", "c", "d", "e"]);
  });
});
