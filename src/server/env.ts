import "server-only";
import { z } from "zod";

const csv = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()).min(1, "AUTH_ALLOWED_DOMAINS を 1 つ以上指定してください"));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_PROVIDER: z.enum(["google", "microsoft-entra-id"]),
    AUTH_ALLOWED_DOMAINS: csv,
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_MICROSOFT_ENTRA_ID_ID: z.string().optional(),
    AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().optional(),
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().optional(),
    AUTH_DEV_LOGIN: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    // 画像の保存先。s3 = S3 互換ストレージ（本番・MinIO）、local = ディスク（ローカル開発・テストのみ）
    STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().min(1).default(".data/uploads"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("ap-northeast-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_DEV_LOGIN) {
      ctx.addIssue({ code: "custom", message: "本番環境では AUTH_DEV_LOGIN を有効にできません" });
    }
    if (env.NODE_ENV === "production" && env.STORAGE_DRIVER === "local") {
      // アプリサーバーをステートレスに保つ（台数を増やしても画像が見える）ため
      ctx.addIssue({ code: "custom", message: "本番環境では STORAGE_DRIVER=s3 を指定してください" });
    }
    if (env.STORAGE_DRIVER === "s3" && !env.S3_BUCKET) {
      ctx.addIssue({ code: "custom", message: "STORAGE_DRIVER=s3 のときは S3_BUCKET を指定してください" });
    }
    if (
      env.AUTH_PROVIDER === "microsoft-entra-id" &&
      env.AUTH_MICROSOFT_ENTRA_ID_ISSUER &&
      /\/(common|organizations|consumers)\//.test(env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)
    ) {
      // テナントを固定しないと、他社テナントのアカウントでも OIDC 認証自体は通ってしまう
      ctx.addIssue({
        code: "custom",
        message: "AUTH_MICROSOFT_ENTRA_ID_ISSUER には自社テナント ID を含む URL を指定してください",
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** 環境変数を検証して返す。ビルド時に評価されないよう、呼び出し時に読む */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      // 値そのものは出さず、どの変数が不正かだけを出す
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`);
      throw new Error(`環境変数が不正です\n${issues.join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** テスト用：process.env を書き換えた後にキャッシュを捨てる */
export function resetEnvCache() {
  cached = undefined;
}
