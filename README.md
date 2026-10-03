# rise ナレッジ

rise tech solutions 社内ナレッジ共有サイト（社内限定）。

- 設計：[docs/design/](docs/design/)
- 開発ルール・コマンド：[CLAUDE.md](CLAUDE.md)

## 開発環境の立ち上げ（簡易版。フェーズ7で詳しく書く）

```
cp .env.example .env    # AUTH_SECRET を生成し、AUTH_ALLOWED_DOMAINS などを設定
docker compose up -d db
npm install
npx prisma migrate deploy
npm run db:seed:dev     # 動作確認用の架空ユーザーと公開記事（開発用 DB のみ）
npm run dev             # http://localhost:3000
```

DB は pg_bigm（日本語全文検索）が必要です。compose の db はビルド時に入れます。
Docker を使わずローカルの PostgreSQL 16（Homebrew）を使う場合は、一度だけ次でビルドして入れてください。

```
git clone --depth 1 https://github.com/pgbigm/pg_bigm.git /tmp/pg_bigm
make -C /tmp/pg_bigm USE_PGXS=1 PG_CONFIG=$(brew --prefix postgresql@16)/bin/pg_config install
```

画像は、開発では `STORAGE_DRIVER="local"`（`.data/uploads` に保存）で動きます。
compose で app を動かす場合は MinIO（S3 互換）に保存します。

SSO の設定がまだない場合は、`.env` で `AUTH_DEV_LOGIN="true"` にするとログイン画面に開発用ログインが出ます。
最初の管理者は、一度ログインしてから `npm run admin:grant -- <メールアドレス>` で登録します。
