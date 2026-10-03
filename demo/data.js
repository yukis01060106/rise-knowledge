// デモ版の初期データ（すべて架空）。このデータはブラウザの中だけで使い、どこにも送らない。

export const USERS = [
  { id: "u-taro", name: "開発 太郎", initials: "K.T.", department: "dev", role: "member" },
  { id: "u-hanako", name: "管理 花子", initials: null, department: "dev", role: "admin" },
  { id: "u-ichiro", name: "基盤 一郎", initials: null, department: "infra", role: "member" },
  { id: "u-jiro", name: "結合 次郎", initials: null, department: "dev", role: "member" },
  { id: "u-midori", name: "設計 みどり", initials: "S.M.", department: "dev", role: "admin" },
];

const day = 24 * 60 * 60 * 1000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();

const SEED = [
  {
    author: "u-ichiro",
    daysAgo: 1,
    title: "Terraform の state ロックが外れないときの対処",
    tags: ["Terraform", "AWS", "トラブルシューティング"],
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
    author: "u-taro",
    daysAgo: 1.5,
    showInitials: true,
    title: "はじめての投稿：現場で役立った小ワザ",
    tags: ["小ワザ", "Linux"],
    body: `## コマンド履歴を検索する

\`Ctrl+R\` を押してから文字を打つと、過去に実行したコマンドを検索できます。

\`\`\`bash
(reverse-i-search)\`ssh': ssh -i ~/.ssh/id_ed25519 deploy@bastion
\`\`\`

もう一度 \`Ctrl+R\` を押すと、さらに前の候補に進みます。
`,
  },
  {
    author: "u-midori",
    daysAgo: 2,
    title: "TypeScript の satisfies を使って設定オブジェクトを安全に書く",
    tags: ["TypeScript", "初心者向け"],
    body: `## 概要

\`as\` で型を付けると、キーの打ち間違いに気づけないことがある。\`satisfies\` なら型チェックしつつ、推論された細かい型も残せる。

\`\`\`ts
type Route = { path: string; auth: boolean };

const routes = {
  home: { path: "/", auth: false },
  admin: { path: "/admin", auth: true },
} satisfies Record<string, Route>;
\`\`\`

| 書き方 | 型チェック | 推論の細かさ |
|---|---|---|
| \`as\` | 弱い | 失われる |
| 型注釈 | 強い | 失われる |
| \`satisfies\` | 強い | 残る |
`,
  },
  {
    author: "u-ichiro",
    daysAgo: 4,
    title: "Linux サーバーのディスクが急に埋まったときに最初に見るところ",
    tags: ["Linux", "監視", "トラブルシューティング"],
    body: `## まず全体を見る

\`\`\`bash
df -h
du -xh / --max-depth=1 2>/dev/null | sort -h | tail
\`\`\`

## よくある原因

1. ログのローテーション漏れ（\`/var/log\`）
2. 削除済みだがプロセスが掴んだままのファイル
3. コンテナのイメージ・ボリューム

> 客先環境では、勝手に削除せず担当者に確認してから対応しましょう。
`,
  },
  {
    author: "u-jiro",
    daysAgo: 6,
    title: "勉強会レポート：テストしやすいコードの書き方",
    tags: ["テスト", "勉強会", "設計"],
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
    author: "u-midori",
    daysAgo: 9,
    title: "Git で直前のコミットにファイルを追加し忘れたとき",
    tags: ["Git", "初心者向け"],
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
    author: "u-ichiro",
    daysAgo: 12,
    title: "Ansible で冪等にユーザーを作るときのポイント",
    tags: ["Ansible", "Linux", "自動化"],
    body: `## 概要

\`user\` モジュールはもともと冪等だが、パスワードの扱いで毎回 changed になりがち。

\`\`\`yaml
- name: 作業ユーザーを作成
  ansible.builtin.user:
    name: deploy
    groups: wheel
    append: true
    update_password: on_create
\`\`\`

\`update_password: on_create\` にすると、2 回目以降はパスワードを更新しない。
`,
  },
];

/** 初期状態。公開済みの記事に加えて、審査待ちの記事を 1 件入れておく（管理者で承認を試せるように） */
export function initialState() {
  const articles = [];
  const versions = [];
  const audit = [];
  let n = 0;
  const id = (p) => `${p}-${++n}`;

  for (const s of SEED) {
    const articleId = id("a");
    const versionId = id("v");
    const at = ago(s.daysAgo);
    articles.push({ id: articleId, authorId: s.author, publishedVersionId: versionId, firstPublishedAt: at, hidden: false });
    versions.push({
      id: versionId, articleId, no: 1, title: s.title, body: s.body, tags: s.tags, status: "published",
      showInitials: Boolean(s.showInitials), submittedAt: at, decidedAt: at, decidedBy: "u-hanako",
      rejectReason: null, basedOn: null, updatedAt: at,
    });
    audit.push({ id: id("l"), at, actor: s.author, action: "submitted", articleId, versionNo: 1 });
    audit.push({ id: id("l"), at, actor: "u-hanako", action: "approved", articleId, versionNo: 1 });
  }

  // 審査待ちの記事（結合 次郎さん）
  const pendingArticle = id("a");
  const at = ago(0.1);
  articles.push({ id: pendingArticle, authorId: "u-jiro", publishedVersionId: null, firstPublishedAt: null, hidden: false });
  versions.push({
    id: id("v"), articleId: pendingArticle, no: 1, title: "VPN がつながらないときの確認手順",
    body: "## 確認すること\n\n1. 接続先ゲートウェイに ping（アドレスは社内 Wiki 参照）\n2. 証明書の期限\n3. 端末の時刻ずれ\n",
    tags: ["VPN", "ネットワーク"], status: "admin_review", showInitials: false, submittedAt: at, decidedAt: null,
    decidedBy: null, rejectReason: null, basedOn: null, updatedAt: at,
  });
  audit.push({ id: id("l"), at, actor: "u-jiro", action: "submitted", articleId: pendingArticle, versionNo: 1 });
  audit.push({ id: id("l"), at, actor: null, action: "ai_check_completed", articleId: pendingArticle, versionNo: 1 });

  return { version: 1, currentUserId: null, articles, versions, audit, seq: n };
}
