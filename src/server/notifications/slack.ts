import "server-only";
import { z } from "zod";

/**
 * Slack 通知（Incoming Webhook）。SLACK_WEBHOOK_URL が未設定なら送らない。
 * 通知には記事の中身を含めない。タイトルと URL だけにする（CLAUDE.md）。
 */
export type SlackJob = { kind: string; title: string; url: string };

const KIND_LABELS: Record<string, string> = {
  published: "新しい記事が公開されました",
  review_requested: "レビュー待ちの記事があります",
  award: "今月のベスト記事が決まりました",
};

const webhookSchema = z.url().refine((u) => u.startsWith("https://hooks.slack.com/"), "Slack の Incoming Webhook の URL を指定してください");

export function slackWebhookUrl(): string | null {
  const raw = process.env.SLACK_WEBHOOK_URL;
  if (!raw) return null;
  const parsed = webhookSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Slack に送る本文。タイトルと URL だけ（記事本文・コメント・差し戻し理由は入れない） */
export function slackPayload(job: SlackJob) {
  const label = KIND_LABELS[job.kind] ?? "お知らせ";
  // Slack のリンク記法で使う記号はエスケープする
  const safeTitle = job.title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c).slice(0, 120);
  return { text: `${label}：<${job.url}|${safeTitle}>` };
}

export async function sendSlackJob(job: SlackJob): Promise<"sent" | "skipped"> {
  const url = slackWebhookUrl();
  if (!url) return "skipped";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(slackPayload(job)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`slack webhook failed: ${res.status}`);
  return "sent";
}
