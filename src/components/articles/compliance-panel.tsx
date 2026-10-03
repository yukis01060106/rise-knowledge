import { describePrescan, type PrescanFinding } from "@/server/compliance/prescan";
import type { ReviewFinding } from "@/server/compliance/reviewer";

const RISK_STYLE = {
  high: "bg-red-600 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-emerald-600 text-white",
} as const;
const RISK_LABEL = { high: "リスク 高", medium: "リスク 中", low: "リスク 低" } as const;
const TYPE_LABEL: Record<ReviewFinding["type"], string> = {
  credential: "認証情報",
  personal_info: "個人情報",
  customer_info: "客先の情報",
  confidential: "社外秘",
  inappropriate: "不適切な表現",
  security: "セキュリティ",
  other: "その他",
};

export function RiskBadge({ level }: { level: keyof typeof RISK_STYLE | null }) {
  if (!level) return null;
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${RISK_STYLE[level]}`}>{RISK_LABEL[level]}</span>;
}

type Check = {
  status: string;
  riskLevel: keyof typeof RISK_STYLE | null;
  summary: string | null;
  findings: unknown;
  prescanFindings: unknown;
  model: string | null;
  errorCode: string | null;
};

/** 管理者のレビュー画面：AI の判定と事前スキャンの警告、指摘箇所を強調した本文 */
export function CompliancePanel({ check, bodyMd, title }: { check: Check | null; bodyMd: string; title: string }) {
  const findings = (Array.isArray(check?.findings) ? check.findings : []) as ReviewFinding[];
  const prescan = (Array.isArray(check?.prescanFindings) ? check.prescanFindings : []) as PrescanFinding[];
  const flagged = new Map<number, string[]>();
  for (const f of findings) if (f.line !== null) flagged.set(f.line, [...(flagged.get(f.line) ?? []), TYPE_LABEL[f.type]]);
  for (const p of prescan) flagged.set(p.line, [...(flagged.get(p.line) ?? []), describePrescan(p).split("：")[1]]);
  const lines = [title, ...bodyMd.split("\n")];

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">AI チェック</h2>
        {check?.status === "succeeded" && <RiskBadge level={check.riskLevel} />}
        {check?.model && <span className="text-xs text-muted">{check.model}</span>}
      </div>
      {!check ? (
        <p className="text-sm text-muted">AI チェックの結果はまだありません。</p>
      ) : check.status === "failed" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          AI チェックに失敗しました（{check.errorCode ?? "不明なエラー"}）。機密情報が含まれていないか、特に注意して確認してください。
        </p>
      ) : (
        <>
          {check.summary && <p className="text-sm">{check.summary}</p>}
          {findings.length > 0 && (
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li key={i} className="rounded-lg bg-background px-3 py-2 text-sm">
                  <p className="text-xs font-semibold text-muted">
                    {f.line === null ? "場所不明" : f.line === 0 ? "タイトル" : `${f.line} 行目`} ・ {TYPE_LABEL[f.type]}
                  </p>
                  <p className="mt-0.5 font-mono text-xs">{f.excerpt}</p>
                  <p className="mt-1">{f.suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {prescan.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">事前スキャンの警告（値は記録していません）</p>
          <ul className="mt-1 list-disc pl-5">
            {prescan.map((p) => (
              <li key={`${p.line}-${p.type}`}>{describePrescan(p)}</li>
            ))}
          </ul>
        </div>
      )}
      {flagged.size > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">指摘箇所を本文で確認する（{flagged.size} 行）</summary>
          <ol className="max-h-96 overflow-auto border-t border-border font-mono text-xs leading-relaxed">
            {lines.map((text, n) => {
              const marks = flagged.get(n);
              return (
                <li key={n} className={`flex gap-3 px-3 ${marks ? "bg-amber-100" : ""}`}>
                  <span className="w-8 shrink-0 text-right text-muted select-none">{n === 0 ? "題" : n}</span>
                  <span className="flex-1 break-all whitespace-pre-wrap">{text || " "}</span>
                  {marks && <span className="shrink-0 font-sans text-amber-800">{marks.join("・")}</span>}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
}
