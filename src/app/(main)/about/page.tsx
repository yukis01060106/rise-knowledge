import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { PHILOSOPHY } from "@/lib/philosophy";
import { buttonClass } from "@/components/ui/button";

/** 強調する語句に手書き風の下線を引く */
function Emphasize({ text, emphasis }: { text: string; emphasis: string }) {
  const i = text.indexOf(emphasis);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="swoosh">{emphasis}</span>
      {text.slice(i + emphasis.length)}
    </>
  );
}

function Heading({ en, ja, split }: { en: string; ja: string; split: string }) {
  return (
    <div className="relative">
      <p className="split-heading text-4xl font-light tracking-wide italic sm:text-5xl" style={{ ["--split" as string]: split }}>
        {en}
      </p>
      <p className="mt-1 text-xs font-bold tracking-[0.3em] text-muted">{ja}</p>
    </div>
  );
}

export default async function AboutPage() {
  await requireUser();
  const { principle, mission, vision, values } = PHILOSOPHY;

  return (
    <div className="space-y-10">
      {/* 事業理念 */}
      <section className="card paper relative overflow-hidden px-6 pt-24 pb-12 sm:px-14 sm:pt-28 sm:pb-16">
        <span aria-hidden className="corner-wedge" />
        <h1
          className="split-heading absolute top-5 left-6 text-4xl font-bold tracking-wider sm:left-10 sm:text-5xl"
          style={{ ["--split" as string]: "44%" }}
        >
          事業理念
        </h1>
        <span aria-hidden className="orbit orbit-spin -right-24 -bottom-32 size-96 border-brand/15 border-l-transparent" />
        <p className="relative space-y-3 text-2xl leading-relaxed sm:text-4xl sm:leading-relaxed">
          {principle.lines.map((line) => (
            <span key={line} className="phrase block w-fit bg-white px-4 py-1.5">
              <Emphasize text={line} emphasis={principle.emphasis} />
            </span>
          ))}
        </p>
      </section>

      {/* ミッション・ビジョン */}
      <div className="grid gap-6 lg:grid-cols-2">
        {(
          [
            ["Mission", "ミッション", mission.lines, "ITとAIで解決する。", "28%"],
            ["Vision", "ビジョン", vision.lines, "生まれる場所をツクる。", "30%"],
          ] as const
        ).map(([en, ja, lines, underline, split]) => (
          <section key={en} className="card paper relative overflow-hidden p-6 sm:p-10">
            <span aria-hidden className="corner-wedge !size-28" />
            <Heading en={en} ja={ja} split={split} />
            <p className="mt-8 space-y-2 text-xl leading-relaxed sm:text-2xl">
              {lines.map((line) => (
                <span key={line} className="phrase block w-fit bg-white px-3 py-1">
                  {line === underline ? <span className="swoosh">{line}</span> : line}
                </span>
              ))}
            </p>
          </section>
        ))}
      </div>

      {/* バリュー */}
      <section className="card paper relative overflow-hidden p-6 sm:p-10">
        <span aria-hidden className="corner-wedge !size-28" />
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <Heading en="Values" ja="バリュー" split="30%" />
          <div className="text-sm leading-relaxed font-medium text-muted">
            {values.lead.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>
        <p className="mt-8 text-lg font-semibold">{values.subject}</p>
        <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {values.items.map((v) => (
            <li key={v.no} className="relative overflow-hidden rounded-2xl bg-white p-5 pr-14">
              <span aria-hidden className="brand-text absolute -top-3 right-3 text-7xl font-bold opacity-20">
                {v.no}
              </span>
              <p className="text-xs font-bold text-brand">VALUE {v.no}</p>
              <p className="mt-1 text-lg font-bold">{v.text}</p>
              {"here" in v && (
                <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-muted ring-1 ring-border">
                  <span className="font-semibold text-brand">このサイトでは：</span>
                  {v.here}
                </p>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/articles/new" className={buttonClass("primary", "md", "brand-gradient rounded-full px-5")}>
            学びを記事にする
          </Link>
          <Link href="/articles" className={buttonClass("secondary", "md", "rounded-full px-5")}>
            仲間の記事を読む
          </Link>
        </div>
      </section>
    </div>
  );
}
