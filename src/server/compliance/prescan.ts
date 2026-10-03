/**
 * 事前スキャン：AI チェックの前に、正規表現で明らかな機密情報を探す。
 * - block：見つかったらレビュー申請そのものを止める（秘密鍵・API キー・本物らしいパスワードなど）
 * - warn：申請はできるが、管理者のレビュー画面に警告として出す（IP アドレス・メールアドレスなど）
 * 結果には「何行目に・どの種類があったか」だけを入れ、一致した値そのものは返さない（保存もしない）。
 */

export type PrescanSeverity = "block" | "warn";

export type PrescanType =
  | "private_key"
  | "cloud_access_key"
  | "api_token"
  | "password"
  | "credential_url"
  | "ip_address"
  | "email"
  | "phone"
  | "internal_host";

export type PrescanFinding = { line: number; type: PrescanType; severity: PrescanSeverity };

export const PRESCAN_LABELS: Record<PrescanType, string> = {
  private_key: "秘密鍵",
  cloud_access_key: "クラウドのアクセスキー",
  api_token: "API キー・トークン",
  password: "パスワードらしき値",
  credential_url: "認証情報を含む接続文字列",
  ip_address: "IP アドレス",
  email: "メールアドレス",
  phone: "電話番号",
  internal_host: "社内向けのホスト名",
};

/** 例示によく使われる値（伏せ字・プレースホルダー）。これらは機密情報として扱わない */
function isPlaceholder(value: string): boolean {
  const v = value.replace(/^["'`]|["'`,;]$/g, "").toLowerCase();
  return (
    v.length === 0 ||
    /^[x*•.\-_#]+$/.test(v) ||
    /^<[^>]*>$/.test(v) ||
    /^\$\{?[a-z0-9_]+\}?$/i.test(v) ||
    /^%[a-z0-9_]+%$/i.test(v) ||
    /^\{\{.*\}\}$/.test(v) ||
    /(your|example|sample|dummy|changeme|placeholder|password|secret|hoge|fuga|test|xxx)/.test(v)
  );
}

const DOC_IPS = [/^0\.0\.0\.0$/, /^127\./, /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^255\.255\.255\./];
const DOC_EMAIL_DOMAINS = /@(example\.(com|org|net|jp)|example\.co\.jp|[a-z0-9-]+\.example|localhost)$/i;

type Rule = {
  type: PrescanType;
  severity: PrescanSeverity;
  /** 行の中から候補を探す（g フラグ付き） */
  pattern: RegExp;
  /** 候補を検出として扱うか（プレースホルダーや例示の値を除く） */
  accept?: (match: RegExpExecArray) => boolean;
};

const RULES: Rule[] = [
  { type: "private_key", severity: "block", pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { type: "cloud_access_key", severity: "block", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    type: "api_token",
    severity: "block",
    pattern:
      /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,})\b/g,
  },
  {
    type: "password",
    severity: "block",
    // DB_PASSWORD のように前後が「_」でも検出する（\b だと「_」を単語の一部とみなすため使わない）
    pattern: /(?<![a-z])(?:password|passwd|pwd|pass|secret|client_secret|api[_-]?key|access[_-]?token)(?![a-z])\s*[:=]\s*(["'`]?)([^\s"'`<>]{6,})\1/gi,
    accept: (m) => !isPlaceholder(m[2] ?? ""),
  },
  {
    type: "credential_url",
    severity: "block",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@]+):([^\s@/]+)@/gi,
    accept: (m) => !isPlaceholder(m[2] ?? ""),
  },
  {
    type: "ip_address",
    severity: "warn",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    accept: (m) => !DOC_IPS.some((r) => r.test(m[0])),
  },
  {
    type: "email",
    severity: "warn",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    accept: (m) => !DOC_EMAIL_DOMAINS.test(m[0]),
  },
  { type: "phone", severity: "warn", pattern: /(?<![\d-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d-])/g },
  { type: "internal_host", severity: "warn", pattern: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:local|internal|corp|intra|lan)\b/gi },
];

/** タイトルと本文をスキャンする。行番号は本文が 1 始まり、タイトルは 0 */
export function prescan(title: string, body: string): PrescanFinding[] {
  const findings: PrescanFinding[] = [];
  const lines = [title, ...body.split("\n")];
  lines.forEach((text, line) => {
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.pattern.exec(text))) {
        if (!rule.accept || rule.accept(m)) {
          if (!findings.some((f) => f.line === line && f.type === rule.type)) {
            findings.push({ line, type: rule.type, severity: rule.severity });
          }
        }
      }
    }
  });
  return findings;
}

export function blockingFindings(findings: PrescanFinding[]) {
  return findings.filter((f) => f.severity === "block");
}

/** 画面に出す説明（値そのものは含めない） */
export function describePrescan(f: PrescanFinding) {
  return `${f.line === 0 ? "タイトル" : `${f.line} 行目`}：${PRESCAN_LABELS[f.type]}`;
}
