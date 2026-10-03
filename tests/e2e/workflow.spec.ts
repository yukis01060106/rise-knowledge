import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByPlaceholder("taro@risetech.example").fill(email);
  await page.getByPlaceholder("名前").fill(name);
  await page.getByRole("button", { name: "開発用ログイン" }).click();
}

test("未ログインで開くとログイン画面へ送られる", async ({ page }) => {
  await page.goto("/articles");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Farticles/);
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
});

test("記事を書いて申請し、別の管理者が承認すると公開される（スクリプトは実行されない）", async ({ browser }) => {
  // 著者（新しいユーザーなので初回設定から）
  const author = await (await browser.newContext()).newPage();
  await login(author, "e2e-author@risetech.example", "E2E 著者");
  await expect(author).toHaveURL(/\/onboarding/);
  await author.getByLabel("開発部").check();
  await author.getByRole("button", { name: "はじめる" }).click();
  await expect(author.getByText("学びを、仲間の武器にする！").first()).toBeVisible();

  await author.goto("/articles/new");
  await author.getByLabel("タイトル").fill("E2E で書いた記事");
  await author.getByLabel("本文（Markdown）").fill("## 手順\n\nテストです。\n\n<script>window.__xss = 1</script>\n<img src=x onerror=\"window.__xss = 2\">");
  await expect(author.getByRole("status").filter({ hasText: "に下書き保存しました" })).toBeVisible();
  author.on("dialog", (d) => d.accept());
  await author.getByRole("button", { name: "レビュー申請" }).click();
  await expect(author).toHaveURL(/\/me\/articles\?tab=review/);
  await expect(author.getByText("E2E で書いた記事")).toBeVisible();

  // 管理者が承認
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "e2e-admin@risetech.example", "E2E 管理者");
  await admin.goto("/admin/reviews");
  await admin.getByText("E2E で書いた記事").click();
  await expect(admin.getByRole("heading", { name: "AI チェック" })).toBeVisible();
  admin.on("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "承認して公開" }).click();
  await expect(admin).toHaveURL(/done=approved/);

  // ほかのメンバーから見える。記事の中のスクリプトは実行されない
  const member = await (await browser.newContext()).newPage();
  await login(member, "e2e-member@risetech.example", "E2E メンバー");
  await member.goto("/articles");
  await member.getByText("E2E で書いた記事").click();
  await expect(member.getByRole("heading", { name: "E2E で書いた記事" })).toBeVisible();
  expect(await member.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  // 著者は自分の記事にいいねできない、メンバーはできる
  await member.getByRole("button", { name: /いいね/ }).click();
  await expect(member.getByRole("button", { name: /いいね 1/ })).toBeVisible();
});

test("メンバーは管理画面を開けない", async ({ page }) => {
  await login(page, "e2e-member@risetech.example", "E2E メンバー");
  await page.goto("/admin/reviews");
  await expect(page.getByText("このページを表示する権限がありません")).toBeVisible();
});
