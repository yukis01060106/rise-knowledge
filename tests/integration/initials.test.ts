import { beforeEach, describe, expect, it } from "vitest";
import { saveDraft } from "@/server/articles/actions";
import { getArticleDetail, listPublishedArticles, searchPublishedArticles } from "@/server/articles/queries";
import { getVersionForReview } from "@/server/articles/admin-queries";
import { submitForReview } from "@/server/workflow";
import { updateMySettings } from "@/server/users/actions";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { loginAs } from "../helpers/auth";
import { advanceVersion } from "../helpers/articles";

beforeEach(resetDb);

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

const draft = { articleId: null, title: "イニシャルで書く記事", bodyMd: "本文", tags: [] as string[], expectedUpdatedAt: null };

/** イニシャル表示で公開された記事を、正規の保存処理で作る */
async function publishedWithInitials() {
  const author = await createUser({ name: "実名 太郎" });
  await prisma.user.update({ where: { id: author.id }, data: { initials: "J.T." } });
  loginAs(author);
  const saved = await saveDraft({ ...draft, showInitials: true });
  if (!saved.ok) throw new Error(saved.message);
  await advanceVersion(saved.versionId, "published");
  await prisma.article.update({ where: { id: saved.articleId }, data: { publishedVersionId: saved.versionId, firstPublishedAt: new Date() } });
  return { author, ...saved };
}

describe("イニシャル投稿", () => {
  it("イニシャルを登録していないとイニシャル表示にできない", async () => {
    const user = await createUser();
    loginAs(user);
    expect(await saveDraft({ ...draft, showInitials: true })).toMatchObject({ ok: false, code: "invalid" });
    expect(await prisma.article.count()).toBe(0);
  });

  it("一覧・検索・詳細ではイニシャルだけを返し、実名とユーザー ID を含めない", async () => {
    const { author, articleId } = await publishedWithInitials();
    const reader = await createUser();

    const list = await listPublishedArticles();
    expect(list.items[0].author).toEqual({ name: "J.T.", department: "dev", isInitials: true, profileId: null });
    const search = await searchPublishedArticles("イニシャル");
    const detail = await getArticleDetail(reader, articleId);
    expect(detail?.author).toEqual({ name: "J.T.", department: "dev", isInitials: true, profileId: null });

    for (const data of [list, search, detail]) {
      const json = JSON.stringify(data);
      expect(json).not.toContain("実名 太郎");
      expect(json).not.toContain(author.id);
      expect(json).not.toContain(author.email);
    }
  });

  it("管理者のレビュー画面では実名が見える", async () => {
    const author = await createUser({ name: "実名 花子" });
    const admin = await createUser({ role: "admin" });
    await prisma.user.update({ where: { id: author.id }, data: { initials: "J.H." } });
    loginAs(author);
    const saved = await saveDraft({ ...draft, showInitials: true });
    if (!saved.ok) throw new Error(saved.message);
    await advanceVersion(saved.versionId, "admin_review");

    const review = await getVersionForReview(admin, saved.versionId);
    expect(review?.article.author).toMatchObject({ name: "実名 花子", initials: "J.H." });
    expect(review?.version.showInitials).toBe(true);
  });

  it("審査に出した版のイニシャル表示は変更できない（DB が拒否する）", async () => {
    const { versionId } = await publishedWithInitials();
    await expect(prisma.articleVersion.update({ where: { id: versionId }, data: { showInitials: false } })).rejects.toThrow(/immutable/);
  });

  it("イニシャルが消えている状態では申請できない", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { initials: "A." } });
    loginAs(user);
    const saved = await saveDraft({ ...draft, showInitials: true });
    if (!saved.ok) throw new Error(saved.message);
    await prisma.user.update({ where: { id: user.id }, data: { initials: null } });
    expect(await submitForReview(user, saved.articleId)).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("設定（所属・イニシャル）", () => {
  it("イニシャルを「K.T.」の形で保存し、所属も変更できる", async () => {
    const user = await createUser({ department: "dev" });
    loginAs(user);
    expect(await updateMySettings(null, form({ department: "infra", initials: "kt" }))).toMatchObject({ ok: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ department: "infra", initials: "K.T." });
  });

  it("アルファベット以外のイニシャルは保存しない", async () => {
    const user = await createUser();
    loginAs(user);
    expect(await updateMySettings(null, form({ department: "dev", initials: "山田" }))).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).initials).toBeNull();
  });

  it("イニシャル表示の記事があるときは、イニシャルを空にできない（変更はできる）", async () => {
    const { author } = await publishedWithInitials();
    loginAs(author);
    expect(await updateMySettings(null, form({ department: "dev", initials: "" }))).toMatchObject({ ok: false });
    expect(await updateMySettings(null, form({ department: "dev", initials: "JT" }))).toMatchObject({ ok: true });
  });
});
