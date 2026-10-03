import { diffStats, foldUnchanged, lineDiff } from "@/lib/diff";

type Side = { title: string; bodyMd: string; tags: { name: string; displayName: string }[] };

/** 2 つの版の差分（タイトル・タグ・本文）。比較元がないとき（初回公開）は呼ばない */
export function DiffView({ before, after, beforeLabel, afterLabel }: { before: Side; after: Side; beforeLabel: string; afterLabel: string }) {
  const lines = lineDiff(before.bodyMd, after.bodyMd);
  const stats = diffStats(lines);
  const hunks = foldUnchanged(lines);
  const beforeTags = new Set(before.tags.map((t) => t.name));
  const afterTags = new Set(after.tags.map((t) => t.name));
  const addedTags = after.tags.filter((t) => !beforeTags.has(t.name));
  const removedTags = before.tags.filter((t) => !afterTags.has(t.name));

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">
        {beforeLabel} → {afterLabel}・本文 <span className="text-emerald-700">+{stats.added}</span> /{" "}
        <span className="text-danger">-{stats.removed}</span> 行
      </p>
      {before.title !== after.title && (
        <div className="rounded-md border border-border">
          <p className="border-b border-border bg-background px-3 py-1 text-xs font-semibold">タイトル</p>
          <p className="bg-red-50 px-3 py-1 text-red-900 line-through decoration-red-300">{before.title}</p>
          <p className="bg-emerald-50 px-3 py-1 text-emerald-900">{after.title}</p>
        </div>
      )}
      {(addedTags.length > 0 || removedTags.length > 0) && (
        <p className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold">タグ：</span>
          {addedTags.map((t) => (
            <span key={`+${t.name}`} className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-900">
              +#{t.displayName}
            </span>
          ))}
          {removedTags.map((t) => (
            <span key={`-${t.name}`} className="rounded bg-red-50 px-1.5 text-xs text-red-900 line-through">
              #{t.displayName}
            </span>
          ))}
        </p>
      )}
      {stats.added + stats.removed === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-muted">本文に変更はありません</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border font-mono text-xs leading-relaxed">
          <table className="w-full border-collapse">
            <tbody>
              {hunks.map((h, i) =>
                "skipped" in h ? (
                  <tr key={i} className="bg-background text-muted">
                    <td colSpan={3} className="px-3 py-1 text-center">
                      … 変更のない {h.skipped} 行 …
                    </td>
                  </tr>
                ) : (
                  h.lines.map((l, j) => (
                    <tr
                      key={`${i}-${j}`}
                      className={l.kind === "add" ? "bg-emerald-50" : l.kind === "del" ? "bg-red-50" : ""}
                    >
                      <td className="w-10 px-2 text-right text-muted select-none">{l.oldNo ?? ""}</td>
                      <td className="w-10 px-2 text-right text-muted select-none">{l.newNo ?? ""}</td>
                      <td className="px-2 whitespace-pre-wrap break-all">
                        <span className="select-none text-muted">{l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}</span>
                        {l.text}
                      </td>
                    </tr>
                  ))
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
