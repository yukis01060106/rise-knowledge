import { diffLines } from "diff";

export type DiffLine = { kind: "add" | "del" | "same"; text: string; oldNo: number | null; newNo: number | null };

/** 2 つの本文を行単位で比べる */
export function lineDiff(before: string, after: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const part of diffLines(before, after)) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) {
      if (part.added) out.push({ kind: "add", text, oldNo: null, newNo: newNo++ });
      else if (part.removed) out.push({ kind: "del", text, oldNo: oldNo++, newNo: null });
      else out.push({ kind: "same", text, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return out;
}

export type DiffHunk = { lines: DiffLine[] } | { skipped: number };

/** 変更のない長い部分を折りたたむ（変更の前後 context 行だけ残す） */
export function foldUnchanged(lines: DiffLine[], context = 3): DiffHunk[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < lines.length) {
    if (keep[i]) {
      const chunk: DiffLine[] = [];
      while (i < lines.length && keep[i]) chunk.push(lines[i++]);
      hunks.push({ lines: chunk });
    } else {
      let n = 0;
      while (i < lines.length && !keep[i]) {
        n++;
        i++;
      }
      hunks.push({ skipped: n });
    }
  }
  return hunks;
}

export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
