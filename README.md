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
npm run dev             # http://localhost:3000
```

SSO の設定がまだない場合は、`.env` で `AUTH_DEV_LOGIN="true"` にするとログイン画面に開発用ログインが出ます。
最初の管理者は、一度ログインしてから `npm run admin:grant -- <メールアドレス>` で登録します。
