import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv, type Env } from "@/server/env";

/** 画像などのファイル置き場。本番は S3 互換ストレージ、ローカル開発・テストはディスクも使える */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** 見つからなければ null */
  get(key: string): Promise<Uint8Array | null>;
}

function createS3Storage(env: Env): Storage {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  const Bucket = env.S3_BUCKET!;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      } catch (e) {
        if (e instanceof NoSuchKey) return null;
        throw e;
      }
    },
  };
}

function createLocalStorage(dir: string): Storage {
  // キーは uuid を含むアプリ側で作った値だけ。念のためディレクトリの外に出られないようにする
  const resolve = (key: string) => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error("invalid storage key");
    return p;
  };
  return {
    async put(key, body) {
      const p = resolve(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
  };
}

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (!cached) {
    const env = getEnv();
    cached = env.STORAGE_DRIVER === "s3" ? createS3Storage(env) : createLocalStorage(env.STORAGE_LOCAL_DIR);
  }
  return cached;
}

/** テスト用：環境変数を変えた後に作り直す */
export function resetStorageCache() {
  cached = undefined;
}
