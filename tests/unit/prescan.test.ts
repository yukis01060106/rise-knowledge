import { describe, expect, it } from "vitest";
import { blockingFindings, prescan } from "@/server/compliance/prescan";

const types = (title: string, body: string) => prescan(title, body).map((f) => `${f.line}:${f.type}:${f.severity}`);

describe("事前スキャン", () => {
  it("秘密鍵・アクセスキー・トークンは申請を止める", () => {
    // 検出用の文字列はテストの中で組み立てる（リポジトリに鍵らしい文字列をそのまま置かない）
    const awsKey = "AKIA" + "ABCDEFGHIJKLMNOP";
    const gh = "ghp_" + "a".repeat(36);
    const body = ["-----BEGIN " + "RSA PRIVATE KEY-----", `aws_access_key_id = ${awsKey}`, `token: ${gh}`].join("\n");
    expect(types("t", body)).toEqual(["1:private_key:block", "2:cloud_access_key:block", "3:api_token:block"]);
  });

  it("本物らしいパスワード・認証情報入りの接続文字列は止める", () => {
    const body = ['DB_PASSWORD="Kx9!mQ2#vL"', "postgres://app:S3cr3tPw@db01:5432/app"].join("\n");
    expect(blockingFindings(prescan("t", body)).map((f) => f.type)).toEqual(["password", "credential_url"]);
  });

  it("伏せ字・プレースホルダー・例示の値は止めない", () => {
    const body = [
      "password: ********",
      "password=<your-password>",
      "api_key: ${API_KEY}",
      "postgres://user:password@localhost:5432/db",
      "postgres://app:xxxx@db:5432/app",
      "接続先は 192.0.2.10 や 127.0.0.1、連絡先は taro@example.com",
    ].join("\n");
    expect(prescan("t", body)).toEqual([]);
  });

  it("IP アドレス・メール・電話番号・社内ホスト名は警告にとどめ、値は返さない", () => {
    const body = ["10.20.30.40 に ssh する", "問い合わせは yamada@acme-corp.co.jp", "03-1234-5678", "web01.corp に配置"].join("\n");
    const found = prescan("t", body);
    expect(found.map((f) => `${f.line}:${f.type}:${f.severity}`)).toEqual([
      "1:ip_address:warn",
      "2:email:warn",
      "3:phone:warn",
      "4:internal_host:warn",
    ]);
    expect(JSON.stringify(found)).not.toContain("10.20.30.40");
    expect(JSON.stringify(found)).not.toContain("yamada");
  });

  it("タイトルは 0 行目として扱う", () => {
    expect(types("10.1.2.3 の障害", "本文")).toEqual(["0:ip_address:warn"]);
  });

  it("バージョン番号のような値（1.2.3）は IP アドレスにしない", () => {
    expect(prescan("t", "Node.js 1.2.3 と v20.11.1")).toEqual([]);
  });
});
