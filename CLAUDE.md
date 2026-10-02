# CLAUDE.md — rise tech solutions 社内ナレッジ共有サイト

@AGENTS.md

このファイルは Claude Code（および人間の開発者）が守る前提・要件・規約をまとめたもの。
方針を変えたら、このファイルも同じコミットで更新すること。

## 1. 背景

- 会社：rise tech solutions、ソリューション事業部（SES）
- 利用者：開発部・インフラ部のメンバー。多くは客先常駐で、普段は離れて働いている
- 目的：バリュー「離れていても、ひとつのチーム！」「学びを、仲間の武器にする！」の実現
- 参考：Qiita（記事投稿・タグ・いいね・ストック・コメント）
- **社内限定**。社外の人からは一切見られないこと（公開ページ・匿名アクセスは作らない）

## 2. 最重要要件：承認フロー

```
draft → ai_review → admin_review → published
          │              │
          └──→ rejected ←┘   （著者が修正して再提出）
```

- 公開の最終判断はかならず人間（管理者）。**AI が自動で公開することは絶対にない**
- 自分の記事を自分で承認することはできない（admin の記事は別の admin が承認）
- 公開後に本文を編集したら新しい版を作り、ai_review から審査し直す。
  審査中も公開中の旧版を表示し続ける
- 審査に出した版（ai_review 以降）は内容を変更しない。修正は新しい版として作る
- AI の判定結果、承認／差し戻し履歴、記事のバージョン履歴はすべて監査ログとして残す
- 監査ログは追記のみ。アプリから UPDATE / DELETE できない（DB 権限とトリガーで強制）
- 状態遷移は `src/server/workflow/` のステートマシン 1 か所にまとめ、ほかの場所で
  `status` を直接書き換えない

詳細：[docs/design/workflow.md](docs/design/workflow.md)

## 3. 技術スタック

| 領域 | 採用 |
|---|---|
| フレームワーク | Next.js（App Router）+ TypeScript（strict） |
| DB | PostgreSQL 16 + Prisma、日本語全文検索に pg_bigm |
| 認証 | Auth.js（NextAuth v5）+ OIDC（社内 SSO）、DB セッション |
| 画像保存 | S3 互換ストレージ（開発は MinIO） |
| 非同期処理 | pg-boss（PostgreSQL ベースのジョブキュー）、AI チェック・通知に使用 |
| Markdown | unified（remark / rehype）+ rehype-sanitize + Shiki |
| 検証 | zod（入力・LLM 応答・環境変数） |
| AI チェック | Claude API（モデル名は設定ファイルで変更可能） |
| テスト | Vitest（単体・統合、DB は Testcontainers または compose の test DB）、Playwright（E2E） |
| 開発環境 | Docker Compose（app / db / minio） |

選定理由：[docs/design/architecture.md](docs/design/architecture.md)

## 4. ディレクトリ構成（予定）

```
src/
  app/                 # Next.js App Router（画面・Route Handler）
  server/              # サーバー専用コード（"server-only" を import する）
    auth/              # セッション取得、requireUser / requireAdmin
    workflow/          # 記事ステートマシン（状態遷移はここだけ）
    compliance/        # 事前スキャン、LLM チェック
    audit/             # 監査ログ書き込み（追記のみ）
    db.ts              # Prisma クライアント
  lib/                 # クライアント・サーバー共用の純粋関数
prompts/               # LLM のシステムプロンプト（compliance_check.md など）
config/                # モデル名・リスクしきい値などの設定
prisma/                # schema.prisma、マイグレーション
docs/                  # 設計書・運用ドキュメント
tests/                 # E2E（Playwright）
```

## 5. 開発ルール（必ず守る）

### 機密情報
- 秘密情報（API キー、Webhook URL、OIDC クライアントシークレット、DB パスワードなど）を
  コード・テスト・ドキュメント・コミットに書かない。環境変数で渡し、`.env.example` には
  ダミー値だけを書く。`.env*`（`.env.example` を除く）はコミットしない
- **ログに記事本文、コメント本文、LLM へのリクエスト・レスポンス本文、トークン、
  Cookie、メールアドレス以外の個人情報を出さない**。ログには ID・件数・所要時間・
  エラーコードを出す
- 画面に出すエラーメッセージに内部情報（スタックトレース、SQL、外部 API の応答）を出さない
- 通知（Slack など）には記事の中身を含めない。タイトルと URL だけにする
- テストデータに実在の客先名・実在の人物名を使わない

### 権限
- 権限チェックはかならずサーバー側で行う（Server Action、Route Handler、
  Server Component でのデータ取得のすべて）。UI で隠すのは補助に過ぎない
- Server Action と Route Handler は、先頭で `requireUser()` / `requireAdmin()` を呼ぶ
- 記事の取得は「誰が・どの版を見てよいか」を判定する関数を通す。Prisma を直接呼んで
  他人の下書きを返すコードを書かない
- middleware で未ログインをログイン画面へリダイレクトするが、それだけに頼らない

### セキュリティ
- Markdown → HTML は必ずサニタイズする（rehype-sanitize、許可リスト方式）。
  `dangerouslySetInnerHTML` はサニタイズ済み HTML を返す関数の出力にだけ使う
- 生 SQL は `$queryRaw` のタグ付きテンプレートだけ使い、`$queryRawUnsafe` は使わない
- 外部入力（フォーム、クエリ、LLM 応答）はすべて zod で検証する
- LLM に送る記事本文はシステムプロンプトに混ぜず、`<article>` タグで囲んだデータとして渡す

### コーディング規約
- TypeScript strict。`any` は使わない（やむを得ない場合は理由をコメントする）
- サーバー専用モジュールは `import "server-only"` を付ける
- 状態や列挙値は Prisma enum と TypeScript の union 型で表し、文字列リテラルを散らばらせない
- 日時は DB では UTC（timestamptz）、表示は Asia/Tokyo
- 画面の文言は日本語。コード中の識別子は英語
- フォーマットは Prettier、リントは ESLint（next/core-web-vitals + typescript）
- 1 フェーズごとにテストが通ることを確認してからコミットする

### テスト
- 権限（未ログイン、ドメイン外、member が admin 機能に触れない、他人の下書き）と
  状態遷移（正常系・異常系）は必ずテストを書く
- LLM API と Slack はテストではモックにする。テストから外部 API を呼ばない

## 6. 開発環境とコマンド

```
cp .env.example .env        # 値を埋める（開発では AUTH_DEV_LOGIN=true にすると SSO なしでログインできる）
docker compose up -d db     # PostgreSQL（ローカルの PostgreSQL 16 でもよい）
npm install                 # postinstall で prisma generate も走る
npm run db:migrate          # マイグレーションの作成・適用（prisma migrate dev）
npm run dev                 # 開発サーバー
npm test                    # Vitest（.env.test の DB を使う。各テストの前に全テーブルを空にする）
npm run typecheck           # 型チェック
npm run lint                # ESLint
npm run admin:grant -- <email>   # 最初の admin を登録（有効な admin が 1 人もいないときだけ動く）
```

- `.env.test` には、名前に `test` を含むテスト用 DB を指定する（global-setup で確認している）
- `prisma migrate reset` などの DB を消すコマンドは、AI エージェントからは実行しない
  （Prisma 側でも止められる）。必要なときは人間に依頼する
- 監査ログのトリガーなど、Prisma スキーマで表せない DB の定義はマイグレーション SQL に追記する
- Next.js 16 では middleware ではなく `src/proxy.ts`。proxy はセッション Cookie の有無しか見ない
- 認証：`src/server/auth/`。`getCurrentUser()` はロールを毎回 DB から読む。
  Server Action のテストでは `tests/helpers/auth.ts` の `loginAs()` で `auth()` を差し替える
