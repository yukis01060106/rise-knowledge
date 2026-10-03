/**
 * 開発環境用のシード。動作確認用に、架空のユーザーと公開済みの記事を作る。
 * 承認には別の管理者が必要で手間がかかるため、ここでだけ版の状態を直接進めて公開記事を作る
 * （DB のトリガーが許す順に進める）。アプリのコードでは状態を直接書き換えないこと。
 *
 *   npm run db:seed:dev
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Department } from "../src/generated/prisma/enums";
import { parseTags } from "../src/lib/tags";

const USERS: { email: string; name: string; department: Department }[] = [
  { email: "seed-dev1@risetech.example", name: "開発 花子", department: "dev" },
  { email: "seed-dev2@risetech.example", name: "結合 次郎", department: "dev" },
  { email: "seed-infra1@risetech.example", name: "基盤 一郎", department: "infra" },
];

const ARTICLES: { author: number; daysAgo: number; title: string; tags: string; body: string }[] = [
  {
    author: 2,
    daysAgo: 1,
    title: "Terraform の state ロックが外れないときの対処",
    tags: "Terraform AWS トラブルシューティング",
    body: `## 発生した問題

\`terraform plan\` を実行すると、次のエラーで止まるようになった。

\`\`\`text
Error: Error acquiring the state lock
Lock Info:
  ID:        xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Operation: OperationTypeApply
\`\`\`

## 原因

前回の \`apply\` を Ctrl+C で中断したため、DynamoDB のロックが残っていた。

## 解決方法

**ほかに実行中の人がいないことをチームで確認してから**、ロックを外す。

\`\`\`bash
terraform force-unlock <LOCK_ID>
\`\`\`

## 気をつけること

- 実行中の apply がある状態で外すと state が壊れる
- CI から実行している場合は、ジョブが残っていないかも確認する
`,
  },
  {
    author: 0,
    daysAgo: 2,
    title: "TypeScript の satisfies を使って設定オブジェクトを安全に書く",
    tags: "TypeScript 初心者向け",
    body: `## 概要

\`as\` で型を付けると、キーの打ち間違いに気づけないことがある。\`satisfies\` なら型チェックしつつ、推論された細かい型も残せる。

\`\`\`ts
type Route = { path: string; auth: boolean };

const routes = {
  home: { path: "/", auth: false },
  admin: { path: "/admin", auth: true },
} satisfies Record<string, Route>;

routes.home.path; // string として使える
\`\`\`

| 書き方 | 型チェック | 推論の細かさ |
|---|---|---|
| \`as\` | 弱い | 失われる |
| 型注釈 | 強い | 失われる |
| \`satisfies\` | 強い | 残る |
`,
  },
  {
    author: 2,
    daysAgo: 4,
    title: "Linux サーバーのディスクが急に埋まったときに最初に見るところ",
    tags: "Linux 監視 トラブルシューティング",
    body: `## まず全体を見る

\`\`\`bash
df -h
du -xh / --max-depth=1 2>/dev/null | sort -h | tail
\`\`\`

## よくある原因

1. ログのローテーション漏れ（\`/var/log\`）
2. 削除済みだがプロセスが掴んだままのファイル
3. コンテナのイメージ・ボリューム

削除済みファイルを掴んでいるプロセスは次で探せる。

\`\`\`bash
lsof +L1
\`\`\`

> 客先環境では、勝手に削除せず担当者に確認してから対応しましょう。
`,
  },
  {
    author: 1,
    daysAgo: 6,
    title: "勉強会レポート：テストしやすいコードの書き方",
    tags: "テスト 勉強会 設計",
    body: `## きっかけ

常駐先でテストが書きにくいコードに悩んでいたので、社内勉強会に参加した。

## 学んだこと

- 副作用（DB・時刻・乱数）は引数で渡せるようにする
- 1 つの関数に「判断」と「実行」を混ぜない
- テスト名は日本語で、仕様として読めるように書く

## 仲間に伝えたいポイント

まずは **純粋な関数を 1 つ切り出す** ところから始めると、効果を実感しやすい。
`,
  },
  {
    author: 0,
    daysAgo: 9,
    title: "Git で直前のコミットにファイルを追加し忘れたとき",
    tags: "Git 初心者向け",
    body: `## 手順

\`\`\`bash
git add 忘れたファイル
git commit --amend --no-edit
\`\`\`

- すでに push 済みのコミットでは使わない（履歴が変わるため）
- push 済みなら、素直に追加のコミットを作る
`,
  },
  {
    author: 2,
    daysAgo: 12,
    title: "Ansible で冪等にユーザーを作るときのポイント",
    tags: "Ansible Linux 自動化",
    body: `## 概要

\`user\` モジュールはもともと冪等だが、パスワードの扱いで毎回 changed になりがち。

\`\`\`yaml
- name: 作業ユーザーを作成
  ansible.builtin.user:
    name: deploy
    groups: wheel
    append: true
    password: "{{ deploy_password | password_hash('sha512', deploy_salt) }}"
    update_password: on_create
\`\`\`

\`update_password: on_create\` にすると、2 回目以降はパスワードを更新しない。
`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = URL.canParse(url) ? new URL(url).pathname.slice(1) : "";
  if (process.env.NODE_ENV === "production" || !dbName.includes("dev")) {
    throw new Error("開発用 DB（名前に dev を含む）でだけ実行できます");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    if (await prisma.user.findUnique({ where: { email: USERS[0].email } })) {
      console.log("シードはすでに投入されています（何もしません）");
      return;
    }

    const users = await Promise.all(USERS.map((u) => prisma.user.create({ data: u })));

    for (const a of ARTICLES) {
      const tags = parseTags([a.tags]);
      if (!tags.ok) throw new Error(tags.message);
      const at = new Date(Date.now() - a.daysAgo * 24 * 60 * 60 * 1000);
      const authorId = users[a.author].id;

      await prisma.$transaction(async (tx) => {
        const article = await tx.article.create({ data: { authorId, createdAt: at } });
        // 新しい版は DB のトリガーで draft からしか作れないため、正規の遷移の順に進める
        const version = await tx.articleVersion.create({
          data: { articleId: article.id, versionNo: 1, title: a.title, bodyMd: a.body, createdBy: authorId, createdAt: at },
        });
        for (const t of tags.tags) {
          const tag = await tx.tag.upsert({ where: { name: t.name }, update: {}, create: t });
          await tx.versionTag.create({ data: { versionId: version.id, tagId: tag.id } });
        }
        await tx.articleVersion.update({ where: { id: version.id }, data: { status: "ai_review", submittedAt: at } });
        await tx.articleVersion.update({ where: { id: version.id }, data: { status: "admin_review" } });
        await tx.articleVersion.update({ where: { id: version.id }, data: { status: "published", decidedAt: at } });
        await tx.article.update({
          where: { id: article.id },
          data: { publishedVersionId: version.id, firstPublishedAt: at },
        });
      });
    }
    console.log(`ユーザー ${users.length} 人、公開記事 ${ARTICLES.length} 件を作りました`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
