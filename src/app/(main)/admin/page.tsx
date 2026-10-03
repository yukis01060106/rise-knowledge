import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { dashboardStats } from "@/server/insights/queries";
import { PageHeader } from "@/components/ui/page-header";
import { monthLabel } from "@/lib/month";

/** 系列の色（検証済み：開発部 #0068b7、インフラ部 #e2733a） */
const SERIES = [
  { key: "dev", label: "開発部", color: "#0068b7" },
  { key: "infra", label: "インフラ部", color: "#e2733a" },
] as const;

function Kpi({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const s = await dashboardStats(admin);
  const max = Math.max(1, ...s.months.flatMap((m) => [m.dev, m.infra]));

  return (
    <div className="space-y-6">
      <PageHeader title="ダッシュボード" description="投稿・審査の状況。レビュー時間と AI の割合は直近 30 日" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="レビュー待ち" value={`${s.pendingReviews} 件`} sub="管理者の確認待ちの記事" href="/admin/reviews" />
        <Kpi label="今月の公開数" value={`${s.publishedThisMonth} 本`} sub={`ログインした人 ${s.activeUsers} 人（30 日）`} />
        <Kpi
          label="レビューの平均時間"
          value={s.avgReviewHours === null ? "-" : s.avgReviewHours < 24 ? `${s.avgReviewHours.toFixed(1)} 時間` : `${(s.avgReviewHours / 24).toFixed(1)} 日`}
          sub={`申請から判断まで（${s.reviewsDecided} 件）`}
        />
        <Kpi label="AI の自動差し戻し率" value={pct(s.autoRejectRate)} sub={`AI チェック未実施 ${pct(s.aiFailRate)}（${s.aiTotal} 件中）`} />
      </div>

      <section className="card p-5 sm:p-6" aria-labelledby="posts-chart">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="posts-chart" className="font-bold">
              月別の公開数
            </h2>
            <p className="text-xs text-muted">著者の部署別・直近 6 か月</p>
          </div>
          <ul className="flex gap-4 text-xs" aria-label="凡例">
            {SERIES.map((x) => (
              <li key={x.key} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: x.color }} />
                {x.label}
              </li>
            ))}
          </ul>
        </div>

        {/* 棒グラフ：細い棒・上だけ角丸・系列の間に 2px の隙間。値は棒の上に表示し、ふれると詳細を出す */}
        <div className="mt-6 grid h-56 grid-cols-6 items-end gap-3 border-b border-border sm:gap-6" role="img" aria-label="月別の公開数の棒グラフ（下に表があります）">
          {s.months.map((m) => (
            <div key={m.month} className="group relative flex h-full items-end justify-center gap-0.5">
              {SERIES.map((x) => {
                const v = m[x.key];
                return (
                  <div key={x.key} className="flex h-full w-full max-w-7 flex-col items-center justify-end">
                    <span className="mb-1 text-[11px] text-muted tabular-nums">{v > 0 ? v : ""}</span>
                    <div className="w-full rounded-t-[4px]" style={{ height: `${(v / max) * 85}%`, minHeight: v > 0 ? 2 : 0, background: x.color }} />
                  </div>
                );
              })}
              <div className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                <p className="font-semibold">{monthLabel(m.month)}</p>
                {SERIES.map((x) => (
                  <p key={x.key}>
                    <span className="mr-1 inline-block size-2 rounded-sm align-middle" style={{ background: x.color }} />
                    {x.label} {m[x.key]} 本
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-3 text-center text-xs text-muted sm:gap-6">
          {s.months.map((m) => (
            <span key={m.month}>{Number(m.month.slice(5))}月</span>
          ))}
        </div>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs text-muted">表で見る</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1">月</th>
                {SERIES.map((x) => (
                  <th key={x.key} className="py-1">
                    {x.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.months.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1">{monthLabel(m.month)}</td>
                  <td className="py-1 tabular-nums">{m.dev}</td>
                  <td className="py-1 tabular-nums">{m.infra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/comments" className="card p-5">
          <p className="text-xs font-semibold text-muted">要確認コメント</p>
          <p className="mt-1 text-2xl font-bold">{s.flaggedComments} 件</p>
        </Link>
        <Link href="/admin/awards" className="card p-5">
          <p className="text-xs font-semibold text-muted">月間ベスト</p>
          <p className="mt-1 text-sm">ランキングから今月の 1 本を選ぶ →</p>
        </Link>
        <Link href="/admin/audit-logs" className="card p-5">
          <p className="text-xs font-semibold text-muted">監査ログ</p>
          <p className="mt-1 text-sm">承認・差し戻し・権限変更の記録 →</p>
        </Link>
      </div>
    </div>
  );
}
