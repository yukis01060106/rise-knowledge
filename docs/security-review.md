# セキュリティ点検の結果（フェーズ 7）

点検日：2026-10-03。対象：main ブランチ（フェーズ 1〜7）。
「確認方法」の自動テストは `npm test`（Vitest）と `npm run test:e2e`（Playwright）で毎回確かめる。

## 点検した項目

| # | 観点 | 結果 | 対策・確認方法 |
|---|---|---|---|
| 1 | 権限チェックの抜け漏れ（Server Action） | OK | すべての Server Action が先頭で `requireUser` / `requireAdmin` を呼ぶ（ログイン・ログアウトを除く）。`tests/unit/security-static.test.ts` がソースを読んで確かめる |
| 2 | 権限チェックの抜け漏れ（画面・Route Handler） | OK | 全ページがサーバー側でログインを確認、`/admin` 以下は `requireAdmin`。Route Handler はログイン確認（Auth.js 本体・開発用ログインを除く）。同上のテスト＋E2E「メンバーは管理画面を開けない」 |
| 3 | 管理者向けの取得 | OK | `admin-queries.ts` などの関数の中でもロールを確認（二重） |
| 4 | 他人の下書き・非公開記事の閲覧 | OK | 記事の取得は `queries.ts` の閲覧権限の判定を通す。admin でも他人の下書きは見えない。`articles.test.ts` |
| 5 | 承認フローの迂回 | OK | 状態遷移は `src/server/workflow/` のみ。DB トリガーで不正な遷移・審査済みの版の変更と削除・draft 以外での版の作成を拒否。自己承認の禁止、同時承認の二重処理防止。`workflow.test.ts` |
| 6 | AI による自動公開 | OK | AI の結果は最大でも admin_review まで。公開は管理者の承認のみ。`compliance.test.ts` |
| 7 | 監査ログの改ざん | OK | トリガーで UPDATE / DELETE / TRUNCATE を拒否。本番はアプリ用ロールの権限でも拒否（`scripts/sql/app-role.sql`、ローカルで拒否されることを確認済み）。`audit-log.test.ts` |
| 8 | XSS | OK | Markdown は生 HTML を捨て、rehype-sanitize（許可リスト）でサニタイズ。`javascript:` などのリンク、外部画像を除去。`dangerouslySetInnerHTML` はサニタイズ済み HTML を出す決まったファイルだけ（静的テスト）。CSP で外部スクリプトを禁止。`markdown.test.ts`、E2E で記事内のスクリプトが実行されないことを確認 |
| 9 | CSRF | OK | Server Action は Next.js が Origin を検証。フォームを受ける Route Handler（画像・開発用ログイン）は Origin を検証。プレビューは JSON のみ受け付ける（別サイトからは事前確認が必要） |
| 10 | SQL インジェクション | OK | 生 SQL はタグ付きテンプレートだけ（`$queryRawUnsafe` なし。静的テスト）。検索語は `likequery()` でエスケープ。`search.test.ts` |
| 11 | ファイルアップロード | OK | 中身の先頭バイトで形式を判定（PNG / JPEG / GIF / WebP のみ、SVG 不可）、5MB・8000px 以下。配信はログイン必須、`nosniff`・`CSP sandbox`・`private` キャッシュ。保存先は外から見えない。`images.test.ts` |
| 12 | プロンプトインジェクション | OK | 記事は `<article>` タグ内に行番号付きで渡し、タグを閉じられないようエスケープ。システムプロンプトで記事内の指示に従わないよう明示。応答はスキーマで検証し、行番号を範囲内に丸める |
| 13 | ログの秘密情報 | OK | ログは ID・件数・所要時間・エラーコードのみ。本文・タイトル・メール・トークン等を出していないことを静的テストで確認 |
| 14 | 通知の情報漏えい | OK | 通知・Slack には本文を入れない（タイトルと URL）。Slack は `hooks.slack.com` 以外に送らない。`insights.test.ts` |
| 15 | イニシャル表示の実名漏れ | OK | 一般の画面に返すデータに実名・ユーザー ID を含めない。コメント・ユーザーページ・ランキングでもひもづけない。`initials.test.ts`、`social.test.ts`、`insights.test.ts` |
| 16 | 認証・セッション | OK | DB セッション。ロールは毎回 DB から読む。無効化したらセッションを削除。許可ドメインの完全一致、Google は `hd` と検証済みメールも確認、Entra ID はテナント固定。開発用ログインは本番で起動しない |
| 17 | オープンリダイレクト | OK | ログイン後の戻り先は同じサイトのパスだけ（`safe-redirect.ts`） |
| 18 | レート制限 | OK（制約あり） | 画像アップロード・プレビュー・コメント・いいね・申請・保存・開発用ログインに上限。`rate-limit.test.ts`、`social.test.ts` |
| 19 | セキュリティヘッダー | OK | CSP、X-Frame-Options、nosniff、Referrer-Policy、Permissions-Policy、HSTS（本番）、noindex。CSP 下で画面が動くことをブラウザで確認 |
| 20 | 社外からのアクセス | 運用で対応 | アプリはログイン必須。加えてリバースプロキシで社内 NW・VPN に限定する（`docs/deploy.md`） |

## 受け入れたリスク・残っている課題

| 項目 | 内容 | 対応 |
|---|---|---|
| 依存関係の脆弱性 | `npm audit` で Prisma CLI 経由の高 4 件（`mysql2`、`deepmerge-ts`）。MySQL ドライバーは使わず（PostgreSQL のみ）、設定の結合に外部入力は入らないため影響なし。ESLint 経由の開発用の依存にも高があるが本番には入らない | Prisma の修正版が出たら更新する |
| 下書きの画像 | 画像の URL（推測できない ID）を知っていれば、ログインしている社員なら下書きに貼った画像も見られる | 社内限定・ログイン必須のため受け入れる。必要なら画像に記事の閲覧権限を結び付ける |
| レート制限の範囲 | プロセスの中で数えるため、web を複数台にすると台数分まで通る | 複数台にするときはリバースプロキシでも制限する |
| CSP の `unsafe-inline` | Next.js のインラインスクリプトのため script-src に必要 | 将来 nonce 方式に切り替える |
| Claude API の実地確認 | 開発環境に API キーがなく、本物の API での審査結果は未確認（モックでの結合テストとキュー経由の動作は確認済み） | 本番前に API キーを入れて、サンプル記事（問題あり・なし）で判定を確認する |
| Docker イメージ | 開発環境に Docker がなく、`docker/app/Dockerfile` と `compose.yaml` のビルドは未確認（`next build` と standalone の出力は確認済み） | 構築時に `docker build` を確認する |
