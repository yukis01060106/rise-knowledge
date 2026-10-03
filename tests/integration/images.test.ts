import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as upload } from "@/app/api/images/route";
import { GET as serve } from "@/app/api/images/[id]/route";
import { POST as preview } from "@/app/api/preview/route";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetStorageCache } from "@/server/storage";
import { createUser, resetDb } from "../helpers/db";
import { loginAs } from "../helpers/auth";

// 1x1 の PNG
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rise-images-"));
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = dir;
  resetEnvCache();
  resetStorageCache();
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.STORAGE_DRIVER;
  delete process.env.STORAGE_LOCAL_DIR;
  resetEnvCache();
  resetStorageCache();
});

beforeEach(resetDb);

function uploadRequest(bytes: Uint8Array, name = "a.png", type = "image/png", origin = "http://localhost:3000") {
  const form = new FormData();
  form.set("file", new File([Buffer.from(bytes)], name, { type }));
  return new NextRequest("http://localhost:3000/api/images", { method: "POST", body: form, headers: { origin } });
}

function serveRequest(id: string) {
  return serve(new Request(`http://localhost:3000/api/images/${id}`), { params: Promise.resolve({ id }) });
}

describe("画像のアップロード", () => {
  it("未ログインでは 401", async () => {
    loginAs(null);
    const res = await upload(uploadRequest(PNG));
    expect(res.status).toBe(401);
    expect(await prisma.image.count()).toBe(0);
  });

  it("PNG を保存し、ログインしていれば配信する", async () => {
    const user = await createUser();
    loginAs(user);
    const res = await upload(uploadRequest(PNG));
    expect(res.status).toBe(201);
    const { id, url } = (await res.json()) as { id: string; url: string };
    expect(url).toBe(`/api/images/${id}`);
    expect(await prisma.image.findUnique({ where: { id } })).toMatchObject({
      uploaderId: user.id,
      mimeType: "image/png",
      width: 1,
      height: 1,
    });

    const got = await serveRequest(id);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PNG);

    // ログアウトしたら見えない（URL を知っていても社外から見られない）
    loginAs(null);
    expect((await serveRequest(id)).status).toBe(401);
  });

  it("SVG は Content-Type を偽っても受け付けない", async () => {
    loginAs(await createUser());
    const res = await upload(uploadRequest(SVG, "a.png", "image/png"));
    expect(res.status).toBe(415);
    expect(await prisma.image.count()).toBe(0);
  });

  it("先頭だけ PNG に見せかけた壊れたファイルは受け付けない", async () => {
    loginAs(await createUser());
    const fake = new Uint8Array([...PNG.subarray(0, 8), ...new TextEncoder().encode("<html>not an image</html>")]);
    expect((await upload(uploadRequest(fake))).status).toBe(415);
  });

  it("5MB を超える画像は受け付けない", async () => {
    loginAs(await createUser());
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await upload(uploadRequest(big))).status).toBe(413);
    expect(await prisma.image.count()).toBe(0);
  });

  it("別のサイトからの送信は拒否する", async () => {
    loginAs(await createUser());
    expect((await upload(uploadRequest(PNG, "a.png", "image/png", "https://evil.example"))).status).toBe(403);
  });

  it("存在しない ID・不正な ID は 404", async () => {
    loginAs(await createUser());
    expect((await serveRequest("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await serveRequest("../../etc/passwd")).status).toBe(404);
  });
});

describe("プレビュー", () => {
  function previewRequest(markdown: string) {
    return new NextRequest("http://localhost:3000/api/preview", {
      method: "POST",
      body: JSON.stringify({ markdown }),
      headers: { "content-type": "application/json" },
    });
  }

  it("未ログインでは 401", async () => {
    loginAs(null);
    expect((await preview(previewRequest("# a"))).status).toBe(401);
  });

  it("サニタイズ済みの HTML を返す", async () => {
    loginAs(await createUser());
    const res = await preview(previewRequest("# 見出し\n\n<img src=x onerror=alert(1)>"));
    const { html } = (await res.json()) as { html: string };
    expect(html).toContain("<h1>見出し</h1>");
    expect(html).not.toContain("onerror");
  });
});
