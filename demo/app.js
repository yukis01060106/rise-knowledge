// rise ナレッジ デモ版。本物のアプリ（Next.js）とは別物で、架空のデータをブラウザの中（localStorage）だけで扱う。
// 承認フローの決まり（自分の記事は承認できない、公開後の編集は新しい版を作る など）は本物に合わせている。
import { html, render, useState, useEffect, useRef, useMemo } from "https://cdn.jsdelivr.net/npm/htm@3/preact/standalone.module.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@15/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.mjs";
import hljs from "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/es/highlight.min.js";
import { USERS, initialState } from "./data.js";

// 分類の定義は本物のアプリ（src/lib/taxonomy.ts）から書き出したもの（npm run demo:build）
const { COMMON_GROUPS, CATEGORIES } = await (await fetch("./taxonomy.json")).json();

/* ───────── 保存（このブラウザの中だけ） ───────── */

const STORAGE_KEY = "rise-knowledge-demo";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && saved.version === 2) return saved;
  } catch {
    // 読めなければ初期状態から始める
  }
  return initialState();
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // プライベートモードなどで保存できなくても、この画面の中では動かす
  }
}

/* ───────── 小さな道具 ───────── */

const DEPARTMENTS = { dev: "開発部", infra: "インフラ部" };
const ROLES = { member: "メンバー", admin: "管理者" };
const STATUS = {
  draft: "下書き",
  ai_review: "AI チェック中",
  admin_review: "管理者の確認待ち",
  published: "公開中",
  rejected: "差し戻し",
  superseded: "過去の版",
};
const ACTIONS = {
  version_created: "版を作成",
  draft_discarded: "下書きを破棄",
  submitted: "レビュー申請",
  ai_check_completed: "AI チェック完了",
  approved: "承認・公開",
  rejected: "差し戻し",
  article_hidden: "緊急非公開",
  article_unhidden: "再公開",
};
const TEMPLATES = [
  { id: "tech-memo", label: "技術メモ", body: "## 概要\n\n## 環境\n\n- OS：\n- バージョン：\n\n## 手順\n\n1. \n2. \n\n## 参考\n\n- \n" },
  { id: "trouble", label: "トラブルシューティング", body: "## 発生した問題\n\n## 原因\n\n## 解決方法\n\n## 再発防止・気をつけること\n" },
  { id: "learning", label: "学んだこと・勉強会レポート", body: "## きっかけ\n\n## 学んだこと\n\n## 仲間に伝えたいポイント\n" },
];

const userOf = (id) => USERS.find((u) => u.id === id);

/* 分類（本物と同じ考え方：大分類 1 つ ＋ 軸ごとの属性。同じ軸の中は「どれか」、軸どうしは「すべて」） */
const categoryOf = (key) => CATEGORIES.find((c) => c.key === key);
const groupsFor = (key) => [...COMMON_GROUPS, ...(categoryOf(key)?.groups ?? [])];
const facetKey = (g, o) => `${g}:${o}`;
const describeFacets = (cat, facets = []) =>
  cat ? groupsFor(cat).flatMap((g) => g.options.filter((o) => facets.includes(facetKey(g.key, o.key))).map((o) => ({ key: facetKey(g.key, o.key), group: g.key, groupLabel: g.label, label: o.label }))) : [];
const excerptOf = (md, n = 90) => {
  const t = (md ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const readingMinutes = (md) => Math.max(1, Math.round((md ?? "").length / 500));
const fmtDate = (iso) =>
  iso ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "-";
const fmtDateTime = (iso) =>
  iso
    ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
    : "-";
const normTag = (t) => t.normalize("NFKC").trim().toLowerCase();
const parseTags = (text) => {
  const seen = new Map();
  for (const raw of text.split(/[\s,、]+/)) {
    const d = raw.normalize("NFKC").trim();
    if (d && !seen.has(normTag(d))) seen.set(normTag(d), d);
  }
  return [...seen.values()];
};
const parseInitials = (input) => {
  const s = input.normalize("NFKC").toUpperCase().replace(/[\s.・]/g, "");
  if (!s) return { ok: false, message: "イニシャルを入力してください" };
  if (!/^[A-Z]+$/.test(s)) return { ok: false, message: "イニシャルはアルファベットで入力してください（例：K.T.）" };
  if (s.length > 4) return { ok: false, message: "イニシャルは 4 文字までです" };
  return { ok: true, value: `${[...s].join(".")}.` };
};

/** 最新の版。作業中（下書き・審査中・差し戻し）かどうかは状態で判断する（本物と同じ） */
const latestVersion = (state, articleId) =>
  state.versions.filter((v) => v.articleId === articleId).sort((a, b) => b.no - a.no)[0] ?? null;
const isWorking = (v) => v && ["draft", "ai_review", "admin_review", "rejected"].includes(v.status);
const publishedOf = (state, article) => state.versions.find((v) => v.id === article.publishedVersionId) ?? null;

/** 一般の画面に出す著者名。イニシャル表示の版では実名を出さない */
function publicAuthor(state, article, version) {
  const u = userOf(article.authorId);
  const settings = state.userSettings?.[u.id] ?? {};
  const initials = settings.initials ?? u.initials;
  const department = settings.department ?? u.department;
  return version?.showInitials ? { name: initials ?? "イニシャル未設定", department, initials: true } : { name: u.name, department, initials: false };
}

const visibleArticles = (state) =>
  state.articles
    .filter((a) => a.publishedVersionId && !a.hidden)
    .sort((a, b) => (b.firstPublishedAt ?? "").localeCompare(a.firstPublishedAt ?? ""));

/* ───────── Markdown（DOMPurify でサニタイズ） ───────── */

marked.setOptions({ gfm: true, breaks: false });
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && /^https?:/i.test(node.getAttribute("href") ?? "")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});
const toHtml = (md) => DOMPurify.sanitize(marked.parse(md ?? ""), { FORBID_TAGS: ["img", "style", "iframe", "form"] });

function Markdown({ source }) {
  const ref = useRef(null);
  const sanitized = useMemo(() => toHtml(source), [source]);
  useEffect(() => {
    ref.current?.querySelectorAll("pre code").forEach((el) => {
      try {
        hljs.highlightElement(el);
      } catch {
        // 未知の言語はそのまま表示する
      }
    });
  }, [sanitized]);
  return html`<div ref=${ref} class="markdown-body" dangerouslySetInnerHTML=${{ __html: sanitized }}></div>`;
}

/* ───────── 行単位の差分（LCS） ───────── */

function lineDiff(a, b) {
  const x = a.replace(/\n$/, "").split("\n");
  const y = b.replace(/\n$/, "").split("\n");
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      out.push({ kind: "add", text: y[j++] });
    } else {
      out.push({ kind: "del", text: x[i++] });
    }
  }
  return out;
}

function DiffView({ before, after, beforeLabel, afterLabel }) {
  const lines = lineDiff(before.body, after.body);
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;
  return html`
    <div class="space-y-3 text-sm">
      <p class="text-xs text-muted">${beforeLabel} → ${afterLabel}・本文 <span class="text-emerald-700">+${added}</span> / <span class="text-danger">-${removed}</span> 行</p>
      ${before.title !== after.title &&
      html`<div class="rounded-md border border-border">
        <p class="border-b border-border bg-background px-3 py-1 text-xs font-semibold">タイトル</p>
        <p class="bg-red-50 px-3 py-1 text-red-900 line-through">${before.title}</p>
        <p class="bg-emerald-50 px-3 py-1 text-emerald-900">${after.title}</p>
      </div>`}
      ${added + removed === 0
        ? html`<p class="rounded-md border border-dashed border-border px-3 py-4 text-center text-muted">本文に変更はありません</p>`
        : html`<div class="overflow-x-auto rounded-md border border-border font-mono text-xs leading-relaxed">
            ${lines.map(
              (l) => html`<div class=${`px-3 whitespace-pre-wrap break-all ${l.kind === "add" ? "bg-emerald-50" : l.kind === "del" ? "bg-red-50" : ""}`}>
                <span class="select-none text-muted">${l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}</span>${l.text}
              </div>`,
            )}
          </div>`}
    </div>
  `;
}

/* ───────── ルーティング（# 付き URL。GitHub Pages でそのまま動く） ───────── */

function currentRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  return { path, query: new URLSearchParams(query) };
}
const go = (to) => {
  location.hash = to;
  window.scrollTo(0, 0);
};

function useRoute() {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/* ───────── 見た目の部品 ───────── */

const btn = (variant = "primary", size = "md") =>
  `inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    { primary: "bg-brand text-white hover:bg-brand-strong", secondary: "border border-border bg-surface hover:bg-background", ghost: "text-muted hover:bg-background hover:text-foreground", danger: "border border-red-200 bg-surface text-danger hover:bg-red-50" }[variant]
  } ${size === "sm" ? "px-2.5 py-1 text-sm" : "px-4 py-2 text-sm"}`;

const Link = ({ to, class: cls, children, onClick }) =>
  html`<a href=${`#${to}`} class=${cls} onClick=${onClick}>${children}</a>`;

function Avatar({ name, department, size = "md" }) {
  const s = { sm: "size-6 text-xs", md: "size-8 text-sm", lg: "size-12 text-lg" }[size];
  const c = department === "infra" ? "bg-gradient-to-br from-slate-400 to-slate-700" : "bg-gradient-to-br from-brand-light to-brand-strong";
  return html`<span aria-hidden="true" class=${`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${s} ${c}`}>${(name ?? "?").charAt(0)}</span>`;
}
const DeptBadge = ({ department }) =>
  department
    ? html`<span class=${`rounded px-1.5 py-0.5 text-xs ${department === "dev" ? "bg-brand-soft text-brand-strong" : "bg-slate-100 text-slate-700"}`}>${DEPARTMENTS[department]}</span>`
    : null;
const TagChip = ({ tag }) =>
  html`<${Link} to=${`/tags/${encodeURIComponent(normTag(tag))}`} class="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-strong hover:bg-blue-100">#${tag}<//>`;
const PageHeader = ({ title, description, actions }) => html`
  <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold tracking-tight">${title}</h1>
      ${description && html`<p class="mt-1 text-sm text-muted">${description}</p>`}
    </div>
    ${actions && html`<div class="flex shrink-0 items-center gap-2">${actions}</div>`}
  </div>
`;
const Empty = ({ title, children }) => html`
  <div class="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
    <p class="font-semibold">${title}</p>
    ${children && html`<div class="mt-2 text-sm text-muted">${children}</div>`}
  </div>
`;
const Tabs = ({ items, active }) => html`
  <nav class="mb-4 flex gap-1 overflow-x-auto border-b border-border">
    ${items.map(
      (t) => html`<${Link}
        to=${t.to}
        class=${`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${t.key === active ? "border-brand text-brand-strong" : "border-transparent text-muted hover:text-foreground"}`}
        >${t.label}${t.count !== undefined && html`<span class="ml-1.5 rounded-full bg-background px-1.5 text-xs">${t.count}</span>`}<//
      >`,
    )}
  </nav>
`;

const ICON_PATHS = {
  dev: "M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16",
  infra: "M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01",
  career: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z",
};
const CategoryIcon = ({ category, cls = "size-4" }) =>
  html`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class=${cls}><path d=${ICON_PATHS[category]} /></svg>`;
function CategoryBadge({ category, size = "sm" }) {
  const c = categoryOf(category);
  if (!c) return null;
  return html`<span class=${`cat-${c.key} cat-gradient inline-flex items-center rounded-full font-semibold text-white ${size === "md" ? "gap-1.5 px-3 py-1 text-sm" : "gap-1 px-2 py-0.5 text-xs"}`}>
    <${CategoryIcon} category=${c.key} cls=${size === "md" ? "size-4" : "size-3.5"} />${c.label}
  </span>`;
}

function cardData(state, a) {
  const v = publishedOf(state, a);
  return { a, v, author: publicAuthor(state, a, v), facets: describeFacets(v.category, v.facets) };
}
const CardChips = ({ d, max = 4 }) => {
  const facets = d.facets.slice(0, max);
  const tags = d.v.tags.slice(0, Math.max(0, max - facets.length));
  return facets.length + tags.length === 0
    ? null
    : html`<div class=${`cat-${d.v.category ?? "dev"} flex flex-wrap gap-1.5`}>
        ${facets.map((f) => html`<span class="cat-soft rounded-md px-2 py-0.5 text-xs font-medium">${f.label}</span>`)}
        ${tags.map((t) => html`<span class="rounded-md bg-background px-2 py-0.5 text-xs text-muted">#${t}</span>`)}
      </div>`;
};
const CardMeta = ({ d }) => html`<div class="flex items-center gap-2 text-xs text-muted">
  <${Avatar} name=${d.author.name} department=${d.author.department} size="sm" />
  <span class="font-medium text-foreground">${d.author.name}</span>
  <${DeptBadge} department=${d.author.department} />
  <span class="ml-auto shrink-0">${fmtDate(d.a.firstPublishedAt)} ・ ${readingMinutes(d.v.body)} 分</span>
</div>`;

function ArticleCards({ state, articles, columns = 1 }) {
  return html`<ul class=${`grid gap-4 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
    ${articles.map((a) => {
      const d = cardData(state, a);
      return html`<li key=${a.id}>
        <${Link} to=${`/articles/${a.id}`} class="card group flex h-full flex-col gap-3 overflow-hidden p-5">
          <div><${CategoryBadge} category=${d.v.category} /></div>
          <h3 class="text-lg leading-snug font-bold group-hover:text-brand">${d.v.title}</h3>
          <p class="line-clamp-2 text-sm leading-relaxed text-muted">${excerptOf(d.v.body)}</p>
          <${CardChips} d=${d} />
          <div class="mt-auto pt-1"><${CardMeta} d=${d} /></div>
        <//>
      </li>`;
    })}
  </ul>`;
}

function FeaturedArticle({ state, a }) {
  const d = cardData(state, a);
  return html`<${Link} to=${`/articles/${a.id}`} class=${`cat-${d.v.category ?? "dev"} card group relative flex flex-col gap-4 overflow-hidden p-6 sm:p-8`}>
    <span aria-hidden="true" class="cat-gradient absolute inset-x-0 top-0 h-1.5"></span>
    <span aria-hidden="true" class="cat-gradient absolute -top-24 -right-24 size-56 rounded-full opacity-10"></span>
    <div class="flex items-center gap-2"><span class="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-bold text-white">NEW</span><${CategoryBadge} category=${d.v.category} /></div>
    <h3 class="text-2xl leading-snug font-bold group-hover:text-brand sm:text-3xl">${d.v.title}</h3>
    <p class="line-clamp-3 leading-relaxed text-muted">${excerptOf(d.v.body, 140)}</p>
    <${CardChips} d=${d} max=${6} />
    <${CardMeta} d=${d} />
  <//>`;
}

/* ───────── 画面 ───────── */

function LoginPage({ onLogin }) {
  const candidates = ["u-taro", "u-hanako", "u-ichiro"].map(userOf);
  return html`
    <main class="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section class="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden="true" class="orbit orbit-spin -top-48 -left-32 size-[36rem] border-t-white/50 border-l-transparent"></span>
        <span aria-hidden="true" class="orbit orbit-spin -right-40 -bottom-56 size-[30rem] border-r-transparent border-b-white/40 [animation-duration:70s]"></span>
        <div class="relative flex items-center gap-3">
          <span class="rounded-2xl bg-white p-2 shadow-lg"><img src="logo.png" alt="" width="40" height="38" /></span>
          <span class="text-xl font-bold">rise ナレッジ</span>
        </div>
        <div class="relative space-y-6">
          <p class="text-4xl leading-tight font-bold tracking-tight xl:text-5xl">離れていても、<br />ひとつのチーム。</p>
          <p class="max-w-md text-white/85">学びを、仲間の武器にする。現場で得た知見を、客先で働く仲間へ届ける rise tech solutions の社内ナレッジ共有サイトです。</p>
          <ul class="flex flex-wrap gap-2 text-sm">${CATEGORIES.map((c) => html`<li class="rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/30">${c.label}</li>`)}</ul>
        </div>
        <p class="relative text-xs text-white/70">操作デモ版・データはすべて架空です</p>
      </section>
      <section class="flex flex-col justify-center px-6 py-14">
        <div class="mx-auto w-full max-w-sm space-y-6">
          <div class="text-center lg:text-left">
            <img src="logo.png" alt="rise tech solutions" width="68" height="64" class="mx-auto mb-4 lg:hidden" />
            <h1 class="text-2xl font-bold tracking-tight">rise ナレッジ <span class="brand-text">操作デモ</span></h1>
            <p class="mt-1 text-sm text-muted">データは架空で、このブラウザの中だけに保存されます。</p>
          </div>
          <div class="space-y-2">
            <p class="text-sm font-semibold">だれとしてログインしますか？</p>
            ${candidates.map(
              (u) => html`<button type="button" onClick=${() => onLogin(u.id)} class="card card-hover flex w-full items-center gap-3 p-3 text-left">
                <${Avatar} name=${u.name} department=${u.department} />
                <span class="flex-1"><span class="block font-semibold">${u.name}</span><span class="text-xs text-muted">${DEPARTMENTS[u.department]}・${ROLES[u.role]}</span></span>
                <span class="text-brand">→</span>
              </button>`,
            )}
          </div>
          <p class="rounded-xl bg-brand-soft p-3 text-xs leading-relaxed text-brand-strong">
            おすすめの試し方：「開発 太郎」で記事を書いてレビュー申請 → 右上のアバターから「管理 花子」に切り替えて承認。
            本物のサイトでは会社のアカウント（SSO）でログインします。
          </p>
        </div>
      </section>
    </main>
  `;
}

function HomePage({ state, me }) {
  const all = visibleArticles(state);
  const [featured, ...rest] = all.slice(0, 7);
  const tagCounts = tagSummary(state).slice(0, 16);
  const mine = state.articles.filter((a) => a.authorId === me.id);
  const groupOf = (a) => {
    const l = latestVersion(state, a.id);
    return !isWorking(l) ? null : l.status === "draft" ? "draft" : l.status === "rejected" ? "rejected" : "review";
  };
  const counts = { draft: 0, review: 0, rejected: 0, published: 0 };
  for (const a of mine) {
    const g = groupOf(a);
    if (g) counts[g]++;
    if (a.publishedVersionId) counts.published++;
  }
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c.key, all.filter((a) => publishedOf(state, a).category === c.key).length]));
  const [q, setQ] = useState("");
  return html`
    <div class="space-y-12">
      <section class="brand-gradient relative overflow-hidden rounded-3xl px-6 py-10 text-white shadow-[0_24px_48px_-24px_rgb(0_71_157/0.55)] sm:px-10 sm:py-14">
        <span aria-hidden="true" class="orbit orbit-spin -top-40 -right-24 size-[28rem] border-t-white/50 border-r-transparent"></span>
        <span aria-hidden="true" class="orbit orbit-spin -right-8 -bottom-48 size-80 border-b-white/40 border-l-transparent [animation-duration:60s]"></span>
        <span aria-hidden="true" class="absolute top-10 right-[22%] size-2 rounded-full bg-white/70"></span>
        <span aria-hidden="true" class="absolute right-[12%] bottom-16 size-3 rounded-full bg-white/40"></span>
        <div class="relative max-w-2xl">
          <p class="text-sm font-medium text-white/80">ようこそ、${me.name.split(" ").pop()} さん</p>
          <h1 class="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-5xl">学びを、<br class="sm:hidden" />仲間の武器にする。</h1>
          <p class="mt-3 text-sm leading-relaxed text-white/85 sm:text-base">現場で得た知見やハマりどころを、離れて働く仲間へ。<br class="hidden sm:inline" />離れていても、ひとつのチーム。</p>
          <form onSubmit=${(e) => (e.preventDefault(), go(`/search?q=${encodeURIComponent(q)}`))} class="mt-6 flex max-w-lg gap-2 rounded-full bg-white/95 p-1.5 shadow-lg">
            <input value=${q} onInput=${(e) => setQ(e.target.value)} type="search" placeholder="キーワードで探す（例：Terraform ロック）" class="min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm text-foreground placeholder:text-gray-400 focus:outline-none" />
            <button class="brand-gradient rounded-full px-5 py-2 text-sm font-semibold text-white">検索</button>
          </form>
          <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/90">
            <${Link} to="/articles/new" class="font-semibold underline-offset-4 hover:underline">✍ 記事を書く<//>
            <span>公開記事 <strong class="text-lg">${all.length}</strong> 本</span>
            <span>あなたの下書き <strong class="text-lg">${counts.draft}</strong> 件</span>
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-4 text-xl font-bold">分類から探す</h2>
        <div class="grid gap-4 sm:grid-cols-3">
          ${CATEGORIES.map(
            (c) => html`<${Link} to=${`/articles?cat=${c.key}`} class=${`cat-${c.key} cat-gradient group relative block overflow-hidden rounded-2xl p-5 text-white shadow-md transition-transform hover:-translate-y-0.5`}>
              <span aria-hidden="true" class="orbit -right-10 -bottom-16 size-40 border-white/25"></span>
              <span class="inline-flex size-10 items-center justify-center rounded-xl bg-white/20"><${CategoryIcon} category=${c.key} cls="size-5" /></span>
              <p class="mt-4 text-lg font-bold">${c.label}</p>
              <p class="mt-1 text-xs leading-relaxed text-white/85">${c.description}</p>
              <p class="mt-4 text-sm font-semibold">${byCat[c.key]} 本 <span class="inline-block transition-transform group-hover:translate-x-1">→</span></p>
            <//>`,
          )}
        </div>
      </section>

      <div class="grid gap-10 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section class="space-y-4">
          <div class="flex items-end justify-between"><h2 class="text-xl font-bold">新着記事</h2><${Link} to="/articles" class="text-sm font-medium text-brand hover:underline">すべて見る →<//></div>
          ${featured && html`<${FeaturedArticle} state=${state} a=${featured} />`}
          ${rest.length > 0 && html`<${ArticleCards} state=${state} articles=${rest} columns=${2} />`}
        </section>
        <aside class="space-y-6">
          <section class="card p-5">
            <h2 class="text-sm font-bold">自分の記事</h2>
            <div class="mt-3 grid grid-cols-2 gap-2 text-center">
              ${[["下書き", counts.draft, "draft"], ["審査中", counts.review, "review"], ["差し戻し", counts.rejected, "rejected"], ["公開中", counts.published, "published"]].map(
                ([label, n, tab]) => html`<${Link} to=${`/me/articles?tab=${tab}`} class="block rounded-xl bg-background px-2 py-3 hover:bg-brand-soft"><span class="block text-2xl font-bold">${n}</span><span class="text-xs text-muted">${label}</span><//>`,
              )}
            </div>
          </section>
          <section class="card p-5">
            <div class="flex items-center justify-between"><h2 class="text-sm font-bold">人気のタグ</h2><${Link} to="/tags" class="text-xs text-brand hover:underline">一覧<//></div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              ${tagCounts.map((t) => html`<${Link} to=${`/tags/${encodeURIComponent(t.name)}`} class="rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand hover:text-brand">#${t.display}<span class="ml-1 text-muted">${t.count}</span><//>`)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function tagSummary(state) {
  const counts = new Map();
  for (const a of visibleArticles(state)) {
    for (const t of publishedOf(state, a).tags) {
      const k = normTag(t);
      const c = counts.get(k) ?? { name: k, display: t, count: 0 };
      c.count++;
      counts.set(k, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function ArticlesPage({ state, query }) {
  const cat = categoryOf(query.get("cat"))?.key;
  const selected = cat ? describeFacets(cat, query.getAll("f")).map((f) => f.key) : [];
  const all = visibleArticles(state);
  const inCat = cat ? all.filter((a) => publishedOf(state, a).category === cat) : all;
  // 同じ軸の中は「どれか」、軸どうしは「すべて」
  const byGroup = {};
  for (const f of describeFacets(cat, selected)) (byGroup[f.group] ??= []).push(f.key);
  const list = inCat.filter((a) => Object.values(byGroup).every((keys) => keys.some((k) => publishedOf(state, a).facets?.includes(k))));
  const facetCount = (key) => inCat.filter((a) => publishedOf(state, a).facets?.includes(key)).length;
  const href = (c, fs) => {
    const sp = new URLSearchParams();
    if (c) sp.set("cat", c);
    for (const f of fs) sp.append("f", f);
    const qs = sp.toString();
    return qs ? `/articles?${qs}` : "/articles";
  };
  const current = categoryOf(cat);
  const countOf = (k) => all.filter((a) => publishedOf(state, a).category === k).length;
  return html`
    <div class="space-y-6">
      <header class=${`${current ? `cat-${current.key} cat-gradient` : "brand-gradient"} relative overflow-hidden rounded-3xl px-6 py-7 text-white sm:px-8`}>
        <span aria-hidden="true" class="orbit orbit-spin -top-24 -right-16 size-72 border-t-white/50 border-r-transparent"></span>
        <p class="relative text-sm text-white/80">記事</p>
        <h1 class="relative mt-1 text-2xl font-bold sm:text-3xl">${current ? current.label : "すべての記事"}</h1>
        <p class="relative mt-1 text-sm text-white/85">${current ? current.description : "分類と属性をかけ合わせて、読みたい記事を探せます。"}</p>
      </header>
      <nav class="flex flex-wrap gap-2">
        <${Link} to="/articles" class=${`rounded-full px-4 py-2 text-sm font-semibold ${!cat ? "bg-foreground text-white" : "bg-surface text-muted ring-1 ring-border hover:text-foreground"}`}>すべて <span class="ml-1 opacity-70">${all.length}</span><//>
        ${CATEGORIES.map((c) => {
          const on = c.key === cat;
          return html`<${Link} to=${href(c.key, [])} class=${`cat-${c.key} inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${on ? "cat-gradient text-white shadow" : "bg-surface ring-1 ring-border"}`}>
            <${CategoryIcon} category=${c.key} cls=${`size-4 ${on ? "" : "cat-ink"}`} />${c.label}<span class="opacity-70">${countOf(c.key)}</span>
          <//>`;
        })}
      </nav>
      <div class=${cat ? "grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]" : ""}>
        ${cat &&
        html`<aside class=${`cat-${cat} card h-fit space-y-5 p-4 lg:sticky lg:top-24`}>
          ${groupsFor(cat).map(
            (g) => html`<div>
              <p class="mb-2 text-xs font-bold text-muted">${g.label}</p>
              <div class="flex flex-wrap gap-1.5">
                ${g.options.filter((o) => !o.hidden).map((o) => {
                  const key = facetKey(g.key, o.key);
                  const on = selected.includes(key);
                  const n = facetCount(key);
                  return html`<${Link} to=${href(cat, on ? selected.filter((x) => x !== key) : [...selected, key])} class=${`rounded-full px-2.5 py-1 text-xs font-medium ${on ? "cat-gradient text-white shadow-sm" : n > 0 ? "cat-soft" : "bg-background text-gray-400"}`}>${o.label}<span class="ml-1 opacity-70">${n}</span><//>`;
                })}
              </div>
            </div>`,
          )}
        </aside>`}
        <section class="min-w-0 space-y-4">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold">${list.length} 件</span>
            ${describeFacets(cat, selected).map((f) => html`<${Link} to=${href(cat, selected.filter((x) => x !== f.key))} class=${`cat-${cat} cat-soft rounded-full px-2.5 py-0.5 text-xs font-medium`}>${f.groupLabel}：${f.label} ×<//>`)}
            ${selected.length > 0 && html`<${Link} to=${href(cat, [])} class="text-xs text-muted underline">条件をクリア<//>`}
          </div>
          ${list.length ? html`<${ArticleCards} state=${state} articles=${list} columns=${cat ? 1 : 2} />` : html`<${Empty} title="条件に合う記事はまだありません">条件を減らすか、この分野の記事を書いてみませんか？<//>`}
        </section>
      </div>
    </div>
  `;
}

function TagsPage({ state }) {
  const tags = tagSummary(state);
  return html`
    <div>
      <${PageHeader} title="タグ" description="公開中の記事に付いているタグ（記事数順）" />
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${tags.map(
          (t) => html`<li key=${t.name}>
            <${Link} to=${`/tags/${encodeURIComponent(t.name)}`} class="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-brand">
              <span class="truncate font-semibold">#${t.display}</span><span class="ml-2 shrink-0 text-sm text-muted">${t.count} 件</span>
            <//>
          </li>`,
        )}
      </ul>
    </div>
  `;
}

function TagPage({ state, name }) {
  const list = visibleArticles(state).filter((a) => publishedOf(state, a).tags.some((t) => normTag(t) === name));
  const display = list.length ? publishedOf(state, list[0]).tags.find((t) => normTag(t) === name) : name;
  return html`
    <div class="mx-auto max-w-3xl">
      <${PageHeader} title=${`#${display}`} description=${`公開中の記事 ${list.length} 件`} />
      ${list.length ? html`<${ArticleCards} state=${state} articles=${list} />` : html`<${Empty} title="このタグの公開記事はまだありません" />`}
    </div>
  `;
}

function SearchPage({ state, query }) {
  const q = query.get("q") ?? "";
  const [input, setInput] = useState(q);
  const terms = q.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? visibleArticles(state).filter((a) => {
        const v = publishedOf(state, a);
        const hay = `${v.title}\n${v.body}\n${v.tags.join(" ")}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
    : null;
  return html`
    <div class="mx-auto max-w-3xl">
      <${PageHeader} title="検索" description=${results ? `「${q}」の検索結果 ${results.length} 件` : "タイトル・本文・タグから探せます。空白で区切ると、すべての語を含む記事を探します。"} />
      <form class="mb-6 flex gap-2" onSubmit=${(e) => (e.preventDefault(), go(`/search?q=${encodeURIComponent(input)}`))}>
        <input value=${input} onInput=${(e) => setInput(e.target.value)} type="search" placeholder="例：Terraform ロック" class="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 focus:border-brand focus:outline-none" />
        <button class=${btn()}>検索</button>
      </form>
      ${results && (results.length ? html`<${ArticleCards} state=${state} articles=${results} />` : html`<${Empty} title="見つかりませんでした">別のことばで試してみてください。<//>`)}
    </div>
  `;
}

function ArticlePage({ state, me, id }) {
  const article = state.articles.find((a) => a.id === id);
  if (!article) return html`<${Empty} title="記事が見つかりません" />`;
  const isAuthor = article.authorId === me.id;
  const published = publishedOf(state, article);
  if (!isAuthor && (!published || (article.hidden && me.role !== "admin"))) return html`<${Empty} title="記事が見つかりません" />`;
  const latest = latestVersion(state, id);
  const working = isAuthor && isWorking(latest) && latest.id !== published?.id ? latest : null;
  const shown = published ?? working;
  const author = publicAuthor(state, article, shown);

  const reviewing = working && ["ai_review", "admin_review"].includes(working.status);
  const rejected = working?.status === "rejected";
  return html`
    <div class="mx-auto max-w-3xl space-y-4">
      ${article.hidden && html`<p class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">この記事は管理者によって非公開になっています。理由：${article.hiddenReason}</p>`}
      ${working &&
      html`<div class=${`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${rejected ? "border-red-200 bg-red-50 text-red-900" : reviewing ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <div>
          <p>
            ${rejected
              ? `v${working.no} は差し戻されました。修正して、もう一度レビューを申請してください。`
              : reviewing
                ? `v${working.no} は審査中です（${STATUS[working.status]}）。承認されると公開されます。`
                : published
                  ? "編集中の新しい版があります。公開中の内容は、新しい版が承認されるまで変わりません。"
                  : "まだ公開されていない記事です（あなたにだけ表示されています）。"}
          </p>
          ${rejected && html`<p class="mt-1 whitespace-pre-wrap">理由：${working.rejectReason}</p>`}
        </div>
        ${!reviewing && html`<${Link} to=${`/articles/${id}/edit`} class=${btn("secondary", "sm")}>${rejected ? "修正する" : "編集を続ける"}<//>`}
      </div>`}
      <article class=${`cat-${shown.category ?? "dev"} card relative overflow-hidden px-5 py-7 sm:px-10 sm:py-10`}>
        <span aria-hidden="true" class="cat-gradient absolute inset-x-0 top-0 h-1.5"></span>
        <header class="mb-8">
          <div class="flex items-center gap-3">
            <${Avatar} name=${author.name} department=${author.department} />
            <div class="text-sm">
              <p class="font-semibold">${author.name}${isAuthor && author.initials && html`<span class="ml-2 rounded bg-background px-1.5 py-0.5 text-xs font-normal text-muted">イニシャルで表示中</span>`}</p>
              <p class="flex items-center gap-2 text-xs text-muted"><${DeptBadge} department=${author.department} />${article.firstPublishedAt ? `${fmtDate(article.firstPublishedAt)} に公開` : "未公開"}</p>
            </div>
            ${isAuthor && !working && html`<${Link} to=${`/articles/${id}/edit`} class=${btn("secondary", "sm") + " ml-auto"}>編集する<//>`}
          </div>
          <div class="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted"><${CategoryBadge} category=${shown.category} /><span>読了 ${readingMinutes(shown.body)} 分</span></div>
          <h1 class="mt-3 text-2xl leading-snug font-bold tracking-tight sm:text-4xl">${shown.title || "（無題）"}</h1>
          <div class="mt-5 flex flex-wrap gap-1.5">
            ${describeFacets(shown.category, shown.facets).map((f) => html`<${Link} to=${`/articles?cat=${shown.category}&f=${encodeURIComponent(f.key)}`} class="cat-soft rounded-md px-2 py-0.5 text-xs font-medium">${f.label}<//>`)}
            ${shown.tags.map((t) => html`<${TagChip} key=${t} tag=${t} />`)}
          </div>
        </header>
        <${Markdown} source=${shown.body} />
      </article>
    </div>
  `;
}

function EditorPage({ state, me, id, actions }) {
  const article = id ? state.articles.find((a) => a.id === id) : null;
  if (id && (!article || article.authorId !== me.id)) return html`<${Empty} title="記事が見つかりません" />`;
  const latest = id ? latestVersion(state, id) : null;
  if (latest && ["ai_review", "admin_review"].includes(latest.status)) {
    return html`<${Empty} title=${`この記事は「${STATUS[latest.status]}」のため編集できません`}>審査が終わるまでお待ちください。<//>`;
  }
  const source = latest?.status === "superseded" ? publishedOf(state, article) : latest;
  return html`<${EditorForm} state=${state} me=${me} id=${id} latest=${latest} source=${source} actions=${actions} />`;
}

/** 入力フォーム本体（フックの呼び出し順を一定にするため、表示してよいかの確認とは分ける） */
function EditorForm({ state, me, id, latest, source, actions }) {
  const myInitials = state.userSettings?.[me.id]?.initials ?? me.initials;

  const [title, setTitle] = useState(source?.title ?? "");
  const [body, setBody] = useState(source?.body ?? "");
  const [tags, setTags] = useState(source?.tags.join(" ") ?? "");
  const [showInitials, setShowInitials] = useState(source?.showInitials ?? false);
  const [category, setCategory] = useState(source?.category ?? me.department);
  const [facets, setFacets] = useState(source?.facets ?? []);
  const [view, setView] = useState("edit");
  const [savedAt, setSavedAt] = useState(latest?.status === "draft" ? latest.updatedAt : null);
  const [error, setError] = useState(null);
  const articleId = useRef(id);
  const dirty = useRef(false);
  const textarea = useRef(null);
  const tagList = parseTags(tags);

  const save = () => {
    if (!articleId.current && !title.trim() && !body.trim()) return null;
    const allowed = groupsFor(category).flatMap((g) => g.options.map((o) => facetKey(g.key, o.key)));
    const result = actions.saveDraft(articleId.current, { title, body, tags: tagList.slice(0, 5), showInitials, category, facets: allowed.filter((f) => facets.includes(f)) });
    articleId.current = result.articleId;
    dirty.current = false;
    setSavedAt(new Date().toISOString());
    if (!id) history.replaceState(null, "", `#/articles/${result.articleId}/edit`);
    return result.articleId;
  };

  // 自動保存（入力が止まって 1.5 秒後）
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(save, 1500);
    return () => clearTimeout(t);
  }, [title, body, tags, showInitials, category, facets]);

  const change = (setter) => (e) => {
    dirty.current = true;
    setter(e.target.type === "checkbox" ? e.target.checked : e.target.value);
  };

  const insertTemplate = (tid) => {
    const t = TEMPLATES.find((x) => x.id === tid);
    if (!t) return;
    dirty.current = true;
    setBody((b) => (b.trim() ? `${b}\n${t.body}` : t.body));
  };

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("タイトルを入力してください");
    if (!body.trim()) return setError("本文を入力してください");
    if (!category) return setError("大分類（開発・インフラ・キャリア）を選んでください");
    if (!confirm("レビューを申請しますか？申請中は編集できません。")) return;
    const aid = save();
    actions.submit(aid);
    go("/me/articles?tab=review");
  };

  return html`
    <div class="flex flex-col gap-3">
      ${latest?.status === "rejected" &&
      html`<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <p class="font-semibold">v${latest.no} は差し戻されました。修正して、もう一度レビューを申請してください。</p>
        <p class="mt-1 whitespace-pre-wrap">理由：${latest.rejectReason}</p>
      </div>`}
      ${latest?.status === "published" &&
      html`<p class="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">公開中の記事を編集しています。保存すると新しい版として下書きになり、公開中の内容は承認されるまでそのまま表示されます。</p>`}
      <div class="card overflow-hidden">
        <div class="space-y-2 border-b border-border p-4">
          <input value=${title} onInput=${change(setTitle)} maxlength="100" placeholder="タイトル" class="w-full bg-transparent text-xl font-bold placeholder:text-gray-400 focus:outline-none sm:text-2xl" />
          <input value=${tags} onInput=${change(setTags)} placeholder="タグを空白区切りで 5 つまで（例：AWS Terraform 初心者向け）" class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-brand focus:bg-surface focus:outline-none" />
          <div class="flex flex-wrap items-center gap-x-3 text-sm">
            <label class=${`flex items-center gap-2 ${myInitials ? "cursor-pointer" : "text-muted"}`}>
              <input type="checkbox" checked=${showInitials} disabled=${!myInitials} onChange=${change(setShowInitials)} />
              著者名をイニシャル${myInitials ? `（${myInitials}）` : ""}で表示する
            </label>
            ${!myInitials && html`<${Link} to="/me/settings" class="text-xs text-brand hover:underline">イニシャルを登録する<//>`}
          </div>
          ${tagList.length > 0 && html`<div class="flex flex-wrap gap-1.5">${tagList.map((t, i) => html`<span class=${`rounded-full px-2.5 py-0.5 text-xs ${i < 5 ? "bg-brand-soft text-brand-strong" : "bg-red-50 text-danger line-through"}`}>#${t}</span>`)}</div>`}
        </div>
        <div class="space-y-3 border-b border-border bg-background/60 p-4">
          <div>
            <p class="mb-2 text-xs font-bold text-muted">大分類 <span class="text-danger">*</span><span class="ml-1 font-normal">（申請に必要）</span></p>
            <div class="flex flex-wrap gap-2">
              ${CATEGORIES.map((c) => {
                const on = category === c.key;
                return html`<button type="button" aria-pressed=${on} onClick=${() => {
                  const allowed = new Set(groupsFor(c.key).flatMap((g) => g.options.map((o) => facetKey(g.key, o.key))));
                  dirty.current = true;
                  setCategory(c.key);
                  setFacets((fs) => fs.filter((f) => allowed.has(f)));
                }} class=${`cat-${c.key} inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${on ? "cat-gradient text-white shadow" : "bg-surface ring-1 ring-border"}`}>
                  <${CategoryIcon} category=${c.key} cls=${`size-4 ${on ? "" : "cat-ink"}`} />${c.label}
                </button>`;
              })}
            </div>
          </div>
          ${category &&
          html`<div class=${`cat-${category} grid gap-3 sm:grid-cols-2`}>
            ${groupsFor(category).map(
              (g) => html`<div>
                <p class="mb-1.5 text-xs font-bold text-muted">${g.label}</p>
                <div class="flex flex-wrap gap-1.5">
                  ${g.options.filter((o) => !o.hidden).map((o) => {
                    const key = facetKey(g.key, o.key);
                    const on = facets.includes(key);
                    return html`<button type="button" aria-pressed=${on} onClick=${() => ((dirty.current = true), setFacets((fs) => (on ? fs.filter((f) => f !== key) : [...fs, key])))} class=${`rounded-full px-2.5 py-1 text-xs font-medium ${on ? "cat-gradient text-white" : "bg-surface text-muted ring-1 ring-border"}`}>${o.label}</button>`;
                  })}
                </div>
              </div>`,
            )}
          </div>`}
        </div>
        <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm">
          <select onChange=${(e) => (insertTemplate(e.target.value), (e.target.value = ""))} class="rounded-md border border-border bg-surface px-2 py-1">
            <option value="">テンプレートを挿入…</option>
            ${TEMPLATES.map((t) => html`<option value=${t.id}>${t.label}</option>`)}
          </select>
          <div class="ml-auto flex rounded-md border border-border lg:hidden">
            ${["edit", "preview"].map((v) => html`<button type="button" onClick=${() => setView(v)} class=${`px-3 py-1 ${view === v ? "bg-brand-soft font-semibold text-brand-strong" : "text-muted"}`}>${v === "edit" ? "入力" : "プレビュー"}</button>`)}
          </div>
        </div>
        <div class="grid lg:grid-cols-2">
          <div class=${`${view === "edit" ? "block" : "hidden"} border-border lg:block lg:border-r`}>
            <textarea ref=${textarea} value=${body} onInput=${change(setBody)} placeholder=${"Markdown で本文を書きます。\n\n客先名・人名・IP アドレス・パスワードなどの機密情報は書かないでください。"} class="block h-[55vh] min-h-72 w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed focus:outline-none"></textarea>
          </div>
          <div class=${`${view === "preview" ? "block" : "hidden"} h-[55vh] min-h-72 overflow-y-auto p-4 lg:block`}>
            ${body.trim() ? html`<${Markdown} source=${body} />` : html`<p class="text-sm text-muted">ここにプレビューが表示されます</p>`}
          </div>
        </div>
      </div>
      ${error && html`<p class="text-sm text-danger">${error}</p>`}
      <div class="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <p class="text-sm text-muted">${savedAt ? `${fmtDateTime(savedAt).slice(-5)} に下書き保存しました` : "入力すると自動で下書き保存されます"}</p>
        <div class="ml-auto flex flex-wrap gap-2">
          ${articleId.current && latest?.status === "draft" &&
          html`<button type="button" class=${btn("ghost") + " text-danger"} onClick=${() => confirm("この下書きを破棄しますか？") && (actions.discard(articleId.current), go("/me/articles"))}>下書きを破棄</button>`}
          <button type="button" class=${btn("secondary")} onClick=${save}>下書き保存</button>
          <button type="button" class=${btn()} onClick=${submit}>レビュー申請</button>
        </div>
      </div>
    </div>
  `;
}

function MyArticlesPage({ state, me, query }) {
  const tab = query.get("tab") ?? "draft";
  const rows = state.articles
    .filter((a) => a.authorId === me.id)
    .map((a) => {
      const latest = latestVersion(state, a.id);
      const w = isWorking(latest) ? latest : null;
      const group = !w ? null : w.status === "draft" ? "draft" : w.status === "rejected" ? "rejected" : "review";
      return { a, w, group, title: w?.title || publishedOf(state, a)?.title || "（無題）" };
    });
  const inTab = (r, t) => (t === "published" ? Boolean(r.a.publishedVersionId) : r.group === t);
  const labels = { draft: "下書き", review: "審査中", rejected: "差し戻し", published: "公開中" };
  const list = rows.filter((r) => inTab(r, tab));
  return html`
    <div class="mx-auto max-w-3xl">
      <${PageHeader} title="自分の記事" actions=${html`<${Link} to="/articles/new" class=${btn()}>記事を書く<//>`} />
      <${Tabs} active=${tab} items=${Object.entries(labels).map(([key, label]) => ({ key, label, to: `/me/articles?tab=${key}`, count: rows.filter((r) => inTab(r, key)).length }))} />
      ${list.length
        ? html`<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            ${list.map(
              (r) => html`<li class="flex flex-wrap items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <${Link} to=${`/articles/${r.a.id}`} class="block truncate font-semibold hover:text-brand">${r.title}<//>
                  <p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    ${r.w && html`<span>v${r.w.no}・${STATUS[r.w.status]}</span>`}
                    ${r.a.publishedVersionId && html`<span class="text-brand">公開中</span>`}
                  </p>
                  ${r.w?.status === "rejected" && html`<p class="mt-1 text-xs text-danger">差し戻しの理由：${r.w.rejectReason}</p>`}
                </div>
                ${(!r.w || ["draft", "rejected"].includes(r.w.status)) && html`<${Link} to=${`/articles/${r.a.id}/edit`} class=${btn("secondary", "sm")}>${r.w?.status === "rejected" ? "修正する" : "編集"}<//>`}
              </li>`,
            )}
          </ul>`
        : html`<${Empty} title=${`${labels[tab]}の記事はありません`} />`}
    </div>
  `;
}

function SettingsPage({ state, me, actions }) {
  const s = state.userSettings?.[me.id] ?? {};
  const [dept, setDept] = useState(s.department ?? me.department);
  const [initials, setInitials] = useState(s.initials ?? me.initials ?? "");
  const [message, setMessage] = useState(null);
  const onSubmit = (e) => {
    e.preventDefault();
    let value = null;
    if (initials.trim()) {
      const r = parseInitials(initials);
      if (!r.ok) return setMessage({ ok: false, text: r.message });
      value = r.value;
      setInitials(value);
    }
    actions.updateSettings(me.id, { department: dept, initials: value });
    setMessage({ ok: true, text: value ? `保存しました（イニシャル：${value}）` : "保存しました" });
  };
  return html`
    <div class="mx-auto max-w-2xl">
      <${PageHeader} title="設定" description=${me.name} />
      <form onSubmit=${onSubmit} class="space-y-6 rounded-xl border border-border bg-surface p-6">
        <fieldset class="space-y-2">
          <legend class="text-sm font-bold">所属部署</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            ${Object.entries(DEPARTMENTS).map(
              ([v, l]) => html`<label class=${`flex cursor-pointer items-center gap-2 rounded-lg border p-3 ${dept === v ? "border-brand bg-brand-soft" : "border-border"}`}>
                <input type="radio" name="dept" checked=${dept === v} onChange=${() => setDept(v)} />${l}
              </label>`,
            )}
          </div>
        </fieldset>
        <div class="space-y-2">
          <label class="block text-sm font-bold" for="initials">イニシャル</label>
          <p class="text-sm text-muted">記事を「イニシャル表示」で投稿すると、ほかの人には名前の代わりにこのイニシャルが表示されます（例：kt → K.T.）。</p>
          <input id="initials" value=${initials} onInput=${(e) => setInitials(e.target.value)} placeholder="K.T." class="w-40 rounded-md border border-border px-3 py-2 font-mono focus:border-brand focus:outline-none" />
          <p class="text-xs text-muted">※ 管理者のレビュー画面と監査ログには実名が表示されます。</p>
        </div>
        <div class="flex items-center gap-3">
          <button class=${btn()}>保存する</button>
          ${message && html`<p class=${`text-sm ${message.ok ? "text-emerald-700" : "text-danger"}`}>${message.text}</p>`}
        </div>
      </form>
    </div>
  `;
}

/* ───────── 管理画面 ───────── */

const AdminLabel = () => html`<p class="mb-3 inline-block rounded bg-foreground px-2 py-0.5 text-xs font-bold text-white">管理</p>`;

function ReviewsPage({ state, me, query }) {
  const pending = state.versions.filter((v) => v.status === "admin_review").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const done = { approved: "承認して公開しました", rejected: "差し戻しました" }[query.get("done")];
  return html`
    <div class="mx-auto max-w-4xl">
      <${AdminLabel} />
      <${PageHeader} title="レビュー待ち" description="申請の古い順。自分の記事は承認できません（ほかの管理者に依頼してください）。" />
      ${done && html`<p class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">${done}</p>`}
      ${pending.length
        ? html`<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            ${pending.map((v) => {
              const a = state.articles.find((x) => x.id === v.articleId);
              const u = userOf(a.authorId);
              return html`<li>
                <${Link} to=${`/admin/reviews/${v.id}`} class="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-background">
                  <div class="min-w-0 flex-1">
                    <p class="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <${CategoryBadge} category=${v.category} />
                      <span class=${`rounded px-1.5 py-0.5 font-semibold ${a.publishedVersionId ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800"}`}>${a.publishedVersionId ? `更新 v${v.no}` : "新規"}</span>
                      ${v.showInitials && html`<span class="rounded bg-violet-50 px-1.5 py-0.5 text-violet-800">イニシャル表示</span>`}
                      ${a.authorId === me.id && html`<span class="rounded bg-gray-100 px-1.5 py-0.5">自分の記事</span>`}
                      <span>${u.name}</span>
                    </p>
                    <p class="mt-1 truncate font-semibold">${v.title}</p>
                  </div>
                  <span class="text-xs text-muted">申請 ${fmtDateTime(v.submittedAt)}</span>
                <//>
              </li>`;
            })}
          </ul>`
        : html`<${Empty} title="レビュー待ちの記事はありません">「開発 太郎」などに切り替えて記事を書き、レビュー申請してみてください。<//>`}
    </div>
  `;
}

function ReviewPage({ state, me, versionId, actions }) {
  const v = state.versions.find((x) => x.id === versionId && x.status !== "draft");
  const [mode, setMode] = useState("idle");
  const [reason, setReason] = useState("");
  if (!v) return html`<${Empty} title="見つかりません" />`;
  const a = state.articles.find((x) => x.id === v.articleId);
  const author = userOf(a.authorId);
  const published = publishedOf(state, a);
  const compareTo = published && published.id !== v.id ? published : null;
  const previousRejected = v.basedOn ? state.versions.find((x) => x.id === v.basedOn && x.status === "rejected") : null;
  const isSelf = a.authorId === me.id;
  const initials = state.userSettings?.[author.id]?.initials ?? author.initials;
  return html`
    <div>
      <${AdminLabel} />
      <div class="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div class="min-w-0 space-y-6">
          <div>
            <${Link} to="/admin/reviews" class="text-sm text-brand hover:underline">← レビュー待ちへ<//>
            <h1 class="mt-2 text-2xl leading-snug font-bold">${v.title}</h1>
            <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <${Avatar} name=${author.name} department=${author.department} size="sm" />
              <span class="text-foreground">${author.name}</span>
              ${v.showInitials && html`<span class="rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-800">イニシャル表示（${initials}）で公開</span>`}
              <span>v${v.no}</span><span>申請 ${fmtDateTime(v.submittedAt)}</span>
            </div>
            <div class=${`cat-${v.category ?? "dev"} mt-3 flex flex-wrap items-center gap-1.5`}>
              <${CategoryBadge} category=${v.category} />
              ${describeFacets(v.category, v.facets).map((f) => html`<span class="cat-soft rounded-md px-2 py-0.5 text-xs font-medium">${f.groupLabel}：${f.label}</span>`)}
              ${v.tags.map((t) => html`<span class="rounded-md bg-background px-2 py-0.5 text-xs text-muted">#${t}</span>`)}
            </div>
          </div>
          ${previousRejected &&
          html`<section class="rounded-xl border border-border bg-surface p-5">
            <h2 class="font-bold">前回差し戻した版からの修正</h2>
            <p class="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">差し戻しの理由：${previousRejected.rejectReason}</p>
            <div class="mt-3"><${DiffView} before=${previousRejected} after=${v} beforeLabel=${`差し戻し v${previousRejected.no}`} afterLabel=${`申請 v${v.no}`} /></div>
          </section>`}
          <section class="rounded-xl border border-border bg-surface p-5">
            <h2 class="mb-3 font-bold">${compareTo ? "公開中の版との差分" : "差分"}</h2>
            ${compareTo
              ? html`<${DiffView} before=${compareTo} after=${v} beforeLabel=${`公開中 v${compareTo.no}`} afterLabel=${`申請 v${v.no}`} />`
              : html`<p class="text-sm text-muted">初めての公開のため、比較する版はありません。</p>`}
          </section>
          <section class="rounded-xl border border-border bg-surface px-5 py-6 sm:px-8">
            <h2 class="mb-4 border-b border-border pb-2 font-bold">本文（公開時の表示）</h2>
            <${Markdown} source=${v.body} />
          </section>
        </div>
        <aside class="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section class="rounded-xl border border-border bg-surface p-4">
            <h2 class="text-sm font-bold">審査</h2>
            <p class="mt-1 text-xs text-muted">状態：${STATUS[v.status]}</p>
            <div class="mt-3 space-y-2">
              ${v.status !== "admin_review"
                ? html`<p class="text-sm">この版は審査待ちではありません。</p>`
                : isSelf
                  ? html`<p class="text-sm">自分の記事は承認・差し戻しできません。ほかの管理者に依頼してください。</p>`
                  : mode === "reject"
                    ? html`<form class="space-y-2" onSubmit=${(e) => (e.preventDefault(), reason.trim() && (actions.reject(v.id, reason.trim()), go("/admin/reviews?done=rejected")))}>
                        <label class="block text-sm font-semibold">差し戻しの理由（著者に表示されます）</label>
                        <textarea required rows="5" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="例：3 行目のホスト名が客先のものと思われます。伏せてから再申請してください。" class="w-full rounded-md border border-border p-2 text-sm focus:border-brand focus:outline-none"></textarea>
                        <div class="flex gap-2"><button class=${btn("danger")}>差し戻す</button><button type="button" class=${btn("ghost")} onClick=${() => setMode("idle")}>やめる</button></div>
                      </form>`
                    : html`<div class="flex flex-wrap gap-2">
                        <button type="button" class=${btn()} onClick=${() => confirm("この版を承認して公開しますか？") && (actions.approve(v.id), go("/admin/reviews?done=approved"))}>承認して公開</button>
                        <button type="button" class=${btn("danger")} onClick=${() => setMode("reject")}>差し戻す</button>
                      </div>`}
            </div>
          </section>
          <section class="rounded-xl border border-border bg-surface p-4 text-sm">
            <h2 class="font-bold">確認のポイント</h2>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              <li>客先名・案件名・人名が書かれていないか</li>
              <li>IP アドレス・ホスト名・URL・認証情報が残っていないか</li>
              <li>画像やログに社外秘の情報が写っていないか</li>
              <li>社外への批判や不適切な表現がないか</li>
            </ul>
          </section>
          <${Link} to=${`/admin/articles/${a.id}/versions`} class="block text-sm text-brand hover:underline">この記事の版の履歴 →<//>
        </aside>
      </div>
    </div>
  `;
}

function AdminArticlesPage({ state, me, actions }) {
  const rows = state.articles.filter((a) => state.versions.some((v) => v.articleId === a.id && v.status !== "draft"));
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState("");
  return html`
    <div>
      <${AdminLabel} />
      <${PageHeader} title="記事管理" description="一度でも審査に出た記事。緊急非公開・再公開には理由が必要です（監査ログに残ります）。" />
      <ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        ${rows.map((a) => {
          const p = publishedOf(state, a);
          const latest = latestVersion(state, a.id);
          return html`<li class="flex flex-wrap items-start gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">${p?.title ?? latest.title}</p>
              <p class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                <span>${userOf(a.authorId).name}</span>
                ${a.hidden
                  ? html`<span class="rounded bg-red-50 px-1.5 font-semibold text-red-800">非公開</span>`
                  : p
                    ? html`<span class="rounded bg-emerald-50 px-1.5 text-emerald-800">公開中 v${p.no}</span>`
                    : html`<span class="rounded bg-gray-100 px-1.5">未公開</span>`}
                ${latest.id !== p?.id && latest.status !== "draft" && html`<span>v${latest.no}：${STATUS[latest.status]}</span>`}
                <${Link} to=${`/admin/articles/${a.id}/versions`} class="text-brand hover:underline">版の履歴<//>
              </p>
            </div>
            ${p &&
            (open === a.id
              ? html`<form class="flex w-full flex-col gap-1.5 sm:w-72" onSubmit=${(e) => (e.preventDefault(), reason.trim() && (actions.setHidden(a.id, !a.hidden, reason.trim()), setOpen(null), setReason("")))}>
                  <textarea required rows="2" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder=${a.hidden ? "再公開の理由" : "非公開にする理由"} class="rounded-md border border-border p-1.5 text-sm"></textarea>
                  <div class="flex gap-1.5"><button class=${btn(a.hidden ? "primary" : "danger", "sm")}>${a.hidden ? "再公開する" : "非公開にする"}</button><button type="button" class=${btn("ghost", "sm")} onClick=${() => setOpen(null)}>やめる</button></div>
                </form>`
              : a.hidden && a.authorId === me.id
                ? html`<span class="text-xs text-muted">自分の記事は再公開できません</span>`
                : html`<button type="button" class=${btn(a.hidden ? "secondary" : "danger", "sm")} onClick=${() => setOpen(a.id)}>${a.hidden ? "再公開" : "緊急非公開"}</button>`)}
          </li>`;
        })}
      </ul>
    </div>
  `;
}

function HistoryPage({ state, articleId, query }) {
  const a = state.articles.find((x) => x.id === articleId);
  const versions = state.versions.filter((v) => v.articleId === articleId && v.status !== "draft").sort((x, y) => y.no - x.no);
  if (!a || !versions.length) return html`<${Empty} title="見つかりません" />`;
  const idx = Math.max(0, versions.findIndex((v) => v.id === query.get("v")));
  const sel = versions[idx];
  const prev = versions[idx + 1];
  const logs = state.audit.filter((l) => l.articleId === articleId);
  return html`
    <div>
      <${AdminLabel} />
      <${PageHeader} title="版の履歴" description=${`${userOf(a.authorId).name} さんの記事。審査に出た版だけを表示します。`} />
      <div class="grid gap-6 xl:grid-cols-[240px_1fr]">
        <aside class="space-y-6">
          <ul class="overflow-hidden rounded-lg border border-border bg-surface text-sm">
            ${versions.map((v) => html`<li class="border-b border-border last:border-0">
              <${Link} to=${`/admin/articles/${articleId}/versions?v=${v.id}`} class=${`block px-3 py-2 ${v.id === sel.id ? "bg-brand-soft" : "hover:bg-background"}`}>
                <span class="font-semibold">v${v.no}</span> <span class="text-xs text-muted">${STATUS[v.status]}</span>
                <span class="block truncate text-xs text-muted">${v.title}</span>
              <//>
            </li>`)}
          </ul>
          <section>
            <h2 class="mb-2 text-sm font-bold">審査の記録</h2>
            <ol class="space-y-2 border-l-2 border-border pl-3 text-xs">
              ${logs.map((l) => html`<li>
                <p class="font-semibold">${ACTIONS[l.action]}${l.versionNo ? ` v${l.versionNo}` : ""}</p>
                <p class="text-muted">${fmtDateTime(l.at)}・${l.actor ? userOf(l.actor).name : "システム"}</p>
                ${l.reason && html`<p class="mt-0.5">理由：${l.reason}</p>`}
              </li>`)}
            </ol>
          </section>
        </aside>
        <div class="min-w-0 space-y-6">
          <section class="rounded-xl border border-border bg-surface p-5">
            <h2 class="font-bold">v${sel.no}（${STATUS[sel.status]}）</h2>
            ${sel.rejectReason && html`<p class="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">差し戻しの理由：${sel.rejectReason}</p>`}
            <div class="mt-4">${prev ? html`<${DiffView} before=${prev} after=${sel} beforeLabel=${`v${prev.no}`} afterLabel=${`v${sel.no}`} />` : html`<p class="text-sm text-muted">最初の版のため、比較する版はありません。</p>`}</div>
          </section>
          <section class="rounded-xl border border-border bg-surface px-5 py-6 sm:px-8">
            <h2 class="mb-4 border-b border-border pb-2 font-bold">${sel.title}</h2>
            <${Markdown} source=${sel.body} />
          </section>
        </div>
      </div>
    </div>
  `;
}

function AuditPage({ state }) {
  const logs = [...state.audit].reverse();
  return html`
    <div>
      <${AdminLabel} />
      <${PageHeader} title="監査ログ" description=${`記録は追記のみで、変更・削除できません。${logs.length} 件`} />
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        <table class="w-full border-collapse text-sm">
          <thead><tr class="border-b border-border bg-background text-left text-xs text-muted"><th class="px-3 py-2">日時</th><th class="px-3 py-2">操作</th><th class="px-3 py-2">操作者</th><th class="px-3 py-2">対象</th><th class="px-3 py-2">理由</th></tr></thead>
          <tbody>
            ${logs.map((l) => {
              const a = state.articles.find((x) => x.id === l.articleId);
              const v = a && latestVersion(state, a.id);
              return html`<tr class="border-b border-border align-top last:border-0">
                <td class="px-3 py-2 text-xs whitespace-nowrap text-muted">${fmtDateTime(l.at)}</td>
                <td class="px-3 py-2 whitespace-nowrap">${ACTIONS[l.action]}</td>
                <td class="px-3 py-2 whitespace-nowrap">${l.actor ? userOf(l.actor).name : html`<span class="text-muted">システム</span>`}</td>
                <td class="max-w-56 truncate px-3 py-2 text-xs">${v ? html`<${Link} to=${`/admin/articles/${a.id}/versions`} class="text-brand hover:underline">${v.title}<//>` : "（削除された下書き）"}${l.versionNo ? ` v${l.versionNo}` : ""}</td>
                <td class="px-3 py-2 text-xs">${l.reason ?? ""}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ───────── 共通の枠（ヘッダー・右側のメニュー） ───────── */

const ICON = (d) => html`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0"><path d=${d} /></svg>`;
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  articles: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  tags: "M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  write: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  mine: "M4 5h11l5 5v9H4zM15 5v5h5",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  review: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11",
  manage: "M4 6h16M4 12h16M4 18h10",
  audit: "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
};

function SideNav({ me, path, query, pending, onNavigate }) {
  const sections = [
    {
      items: [
        ["/", "ホーム", "home", (p) => p === "/"],
        ["/articles", "記事", "articles", (p) => (p === "/articles" && !query.get("cat")) || /^\/articles\/[^/]+$/.test(p)],
        ["/tags", "タグ", "tags", (p) => p.startsWith("/tags")],
        ["/search", "検索", "search", (p) => p.startsWith("/search")],
      ],
    },
    {
      title: "分類",
      items: CATEGORIES.map((c) => [`/articles?cat=${c.key}`, c.label, `cat:${c.key}`, (p) => p === "/articles" && query.get("cat") === c.key]),
    },
    {
      title: "自分",
      items: [
        ["/articles/new", "記事を書く", "write", (p) => p === "/articles/new" || p.endsWith("/edit")],
        ["/me/articles", "自分の記事", "mine", (p) => p.startsWith("/me/articles")],
        ["/me/settings", "設定", "settings", (p) => p.startsWith("/me/settings")],
      ],
    },
  ];
  if (me.role === "admin") {
    sections.push({
      title: "管理",
      items: [
        ["/admin/reviews", "レビュー待ち", "review", (p) => p.startsWith("/admin/reviews"), pending],
        ["/admin/articles", "記事管理", "manage", (p) => p.startsWith("/admin/articles")],
        ["/admin/audit-logs", "監査ログ", "audit", (p) => p.startsWith("/admin/audit-logs")],
      ],
    });
  }
  return html`<nav aria-label="メインメニュー" class="space-y-5">
    ${sections.map(
      (s) => html`<div>
        ${s.title && html`<p class="mb-1 px-3 text-xs font-semibold text-muted">${s.title}</p>`}
        <ul class="space-y-0.5">
          ${s.items.map(([to, label, icon, match, badge]) => {
            const active = match(path);
            const iconEl = icon.startsWith("cat:")
              ? html`<span class=${`cat-${icon.slice(4)} cat-gradient inline-flex size-5 shrink-0 items-center justify-center rounded-md text-white`}><${CategoryIcon} category=${icon.slice(4)} cls="size-3.5" /></span>`
              : ICON(ICONS[icon]);
            return html`<li><${Link} to=${to} onClick=${onNavigate} class=${`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-surface text-brand-strong shadow-sm ring-1 ring-border" : "text-foreground/75 hover:bg-surface/70"}`}>
              ${active && html`<span aria-hidden="true" class="brand-gradient absolute inset-y-2 -left-0.5 w-1 rounded-full"></span>`}${iconEl}<span class="flex-1">${label}</span>${badge ? html`<span class="rounded-full bg-accent px-1.5 text-xs font-bold text-white">${badge}</span>` : null}
            <//></li>`;
          })}
        </ul>
      </div>`,
    )}
  </nav>`;
}

function Shell({ state, me, route, actions, children }) {
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const pending = me.role === "admin" ? state.versions.filter((v) => v.status === "admin_review").length : 0;
  const [q, setQ] = useState("");
  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [route.path, route.query.toString()]);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
  }, [drawer]);
  const search = (e) => (e.preventDefault(), go(`/search?q=${encodeURIComponent(q)}`));
  const s = state.userSettings?.[me.id] ?? {};
  const dept = s.department ?? me.department;

  return html`
    <div class="flex min-h-screen flex-col">
      <div class="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-950">
        操作デモ版です。データは架空で、このブラウザの中だけに保存されます。
        <button type="button" class="ml-2 underline" onClick=${() => confirm("デモを最初の状態に戻しますか？") && actions.reset()}>最初からやり直す</button>
      </div>
      <header class="glass sticky top-0 z-20 border-b border-white/60 shadow-[0_1px_0_rgb(15_35_70/0.06)]">
        <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <${Link} to="/" class="flex items-center gap-2 font-bold text-brand-strong"><img src="logo.png" alt="" width="30" height="28" /><span class="brand-text hidden text-lg tracking-tight sm:inline">rise ナレッジ</span><//>
          <form onSubmit=${search} class="ml-auto hidden w-72 md:block">
            <input value=${q} onInput=${(e) => setQ(e.target.value)} type="search" placeholder="記事を検索" class="w-full rounded-full border border-border bg-surface/80 px-4 py-1.5 text-sm focus:border-brand focus:bg-surface focus:outline-none" />
          </form>
          <div class="ml-auto flex items-center gap-2 md:ml-0">
            <${Link} to="/articles/new" class=${btn("primary", "sm") + " brand-gradient rounded-full px-3.5 shadow-sm"}>記事を書く<//>
            <div class="relative">
              <button type="button" onClick=${() => setMenu(!menu)} class="rounded-md px-1 py-1 hover:bg-background" aria-label="ユーザーメニュー"><${Avatar} name=${me.name} department=${dept} /></button>
              ${menu &&
              html`<div class="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                <div class="border-b border-border px-3 py-2"><p class="font-semibold">${me.name}</p><p class="text-xs text-muted">${DEPARTMENTS[dept]}・${ROLES[me.role]}</p></div>
                <${Link} to="/me/articles" class="block rounded px-3 py-2 text-sm hover:bg-background">自分の記事<//>
                <${Link} to="/me/settings" class="block rounded px-3 py-2 text-sm hover:bg-background">設定<//>
                <p class="mt-1 border-t border-border px-3 pt-2 text-xs text-muted">ユーザーを切り替える（デモ）</p>
                ${["u-taro", "u-hanako", "u-ichiro"].filter((id) => id !== me.id).map((id) => {
                  const u = userOf(id);
                  return html`<button type="button" onClick=${() => actions.login(id)} class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-background"><${Avatar} name=${u.name} department=${u.department} size="sm" />${u.name}<span class="text-xs text-muted">${ROLES[u.role]}</span></button>`;
                })}
                <button type="button" onClick=${() => actions.login(null)} class="mt-1 block w-full border-t border-border px-3 py-2 text-left text-sm text-muted hover:bg-background">ログアウト</button>
              </div>`}
            </div>
            <button type="button" onClick=${() => setDrawer(true)} aria-label="メニューを開く" class="-mr-1 rounded-md p-1.5 hover:bg-background lg:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="size-6"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
      </header>
      <div class="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 lg:grid-cols-[minmax(0,1fr)_200px]">
        <aside class="hidden lg:order-last lg:block"><div class="sticky top-16 py-8"><${SideNav} me=${me} path=${route.path} query=${route.query} pending=${pending} /></div></aside>
        <main class="min-w-0 py-8">${children}</main>
      </div>
      <footer class="border-t border-border py-6 text-center text-xs text-muted">
        rise tech solutions 社内ナレッジ共有サイト（デモ版）・ <a class="underline" href="https://github.com/yukis01060106/rise-knowledge">ソースコード</a>
      </footer>
      ${drawer &&
      html`<div class="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
        <div class="absolute inset-0 bg-black/30" onClick=${() => setDrawer(false)}></div>
        <div class="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-background p-4 shadow-xl">
          <div class="flex items-center justify-between"><span class="font-bold text-brand-strong">メニュー</span><button type="button" onClick=${() => setDrawer(false)} aria-label="メニューを閉じる" class="rounded-md p-1.5 hover:bg-surface">✕</button></div>
          <form onSubmit=${search}><input value=${q} onInput=${(e) => setQ(e.target.value)} type="search" placeholder="記事を検索" class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" /></form>
          <${SideNav} me=${me} path=${route.path} query=${route.query} pending=${pending} onNavigate=${() => setDrawer(false)} />
        </div>
      </div>`}
    </div>
  `;
}

/* ───────── 操作（承認フローの決まりは本物に合わせる） ───────── */

function useDemo() {
  // 操作の結果（新しい記事の ID など）をその場で返せるよう、最新の状態は ref に持って同期的に更新する
  const ref = useRef(null);
  ref.current ??= loadState();
  const [state, setState] = useState(ref.current);
  const update = (fn) => {
    const next = structuredClone(ref.current);
    fn(next);
    ref.current = next;
    saveState(next);
    setState(next);
  };
  const now = () => new Date().toISOString();
  const newId = (s, p) => `${p}-${++s.seq}`;
  const log = (s, entry) => s.audit.push({ id: newId(s, "l"), at: now(), ...entry });

  // AI チェック中の版は、少し待ってから管理者の確認待ちに進める（デモでは判定はせず通過）
  useEffect(() => {
    const waiting = state.versions.filter((v) => v.status === "ai_review");
    if (!waiting.length) return;
    const t = setTimeout(
      () =>
        update((s) => {
          for (const v of s.versions.filter((x) => x.status === "ai_review")) {
            v.status = "admin_review";
            log(s, { actor: null, action: "ai_check_completed", articleId: v.articleId, versionNo: v.no });
          }
        }),
      1500,
    );
    return () => clearTimeout(t);
  }, [state]);

  const actions = {
    login: (userId) => (update((s) => (s.currentUserId = userId)), go("/")),
    reset: () => {
      const fresh = initialState();
      fresh.currentUserId = ref.current.currentUserId;
      ref.current = fresh;
      saveState(fresh);
      setState(fresh);
      go("/");
    },
    updateSettings: (userId, settings) =>
      update((s) => {
        s.userSettings ??= {};
        s.userSettings[userId] = settings;
      }),
    saveDraft: (articleId, data) => {
      let result;
      update((s) => {
        const me = s.currentUserId;
        let article = articleId && s.articles.find((a) => a.id === articleId);
        if (!article) {
          article = { id: newId(s, "a"), authorId: me, publishedVersionId: null, firstPublishedAt: null, hidden: false };
          s.articles.push(article);
        }
        const latest = latestVersion(s, article.id);
        if (latest?.status === "draft") {
          Object.assign(latest, data, { updatedAt: now() });
        } else {
          // 公開後の編集・差し戻し後の修正は、新しい版を作る
          const no = (latest?.no ?? 0) + 1;
          s.versions.push({
            id: newId(s, "v"), articleId: article.id, no, ...data, status: "draft", submittedAt: null, decidedAt: null,
            decidedBy: null, rejectReason: null, basedOn: latest?.status === "rejected" ? latest.id : article.publishedVersionId, updatedAt: now(),
          });
          log(s, { actor: me, action: "version_created", articleId: article.id, versionNo: no });
        }
        result = { articleId: article.id };
      });
      return result;
    },
    submit: (articleId) =>
      update((s) => {
        const v = latestVersion(s, articleId);
        if (v?.status !== "draft") return;
        v.status = "ai_review";
        v.submittedAt = now();
        log(s, { actor: s.currentUserId, action: "submitted", articleId, versionNo: v.no });
      }),
    discard: (articleId) =>
      update((s) => {
        const v = latestVersion(s, articleId);
        if (v?.status !== "draft") return;
        s.versions = s.versions.filter((x) => x.id !== v.id);
        const article = s.articles.find((a) => a.id === articleId);
        if (!article.publishedVersionId && !s.versions.some((x) => x.articleId === articleId)) s.articles = s.articles.filter((a) => a.id !== articleId);
        log(s, { actor: s.currentUserId, action: "draft_discarded", articleId, versionNo: v.no });
      }),
    approve: (versionId) =>
      update((s) => {
        const v = s.versions.find((x) => x.id === versionId);
        const a = s.articles.find((x) => x.id === v.articleId);
        if (v.status !== "admin_review" || a.authorId === s.currentUserId) return; // 自分の記事は承認できない
        const prev = publishedOf(s, a);
        if (prev) prev.status = "superseded";
        Object.assign(v, { status: "published", decidedAt: now(), decidedBy: s.currentUserId });
        a.publishedVersionId = v.id;
        a.firstPublishedAt ??= now();
        log(s, { actor: s.currentUserId, action: "approved", articleId: a.id, versionNo: v.no });
      }),
    reject: (versionId, reason) =>
      update((s) => {
        const v = s.versions.find((x) => x.id === versionId);
        const a = s.articles.find((x) => x.id === v.articleId);
        if (v.status !== "admin_review" || a.authorId === s.currentUserId) return;
        Object.assign(v, { status: "rejected", decidedAt: now(), decidedBy: s.currentUserId, rejectReason: reason });
        log(s, { actor: s.currentUserId, action: "rejected", articleId: a.id, versionNo: v.no, reason });
      }),
    setHidden: (articleId, hidden, reason) =>
      update((s) => {
        const a = s.articles.find((x) => x.id === articleId);
        if (!hidden && a.authorId === s.currentUserId) return; // 再公開は別の管理者が行う
        a.hidden = hidden;
        a.hiddenReason = hidden ? reason : null;
        log(s, { actor: s.currentUserId, action: hidden ? "article_hidden" : "article_unhidden", articleId, reason });
      }),
  };
  return { state, actions };
}

/* ───────── アプリ本体 ───────── */

function App() {
  const { state, actions } = useDemo();
  const route = useRoute();
  const me = userOf(state.currentUserId);
  if (!me) return html`<${LoginPage} onLogin=${actions.login} />`;

  const p = route.path;
  const props = { state, me, actions, query: route.query };
  let m;
  let page;
  if (p === "/") page = html`<${HomePage} ...${props} />`;
  else if (p === "/articles") page = html`<${ArticlesPage} ...${props} />`;
  else if (p === "/articles/new") page = html`<${EditorPage} key="new" ...${props} id=${null} />`;
  else if ((m = p.match(/^\/articles\/([^/]+)\/edit$/))) page = html`<${EditorPage} key=${m[1]} ...${props} id=${m[1]} />`;
  else if ((m = p.match(/^\/articles\/([^/]+)$/))) page = html`<${ArticlePage} ...${props} id=${m[1]} />`;
  else if (p === "/tags") page = html`<${TagsPage} ...${props} />`;
  else if ((m = p.match(/^\/tags\/(.+)$/))) page = html`<${TagPage} ...${props} name=${decodeURIComponent(m[1])} />`;
  else if (p === "/search") page = html`<${SearchPage} key=${route.query.get("q")} ...${props} />`;
  else if (p === "/me/articles") page = html`<${MyArticlesPage} ...${props} />`;
  else if (p === "/me/settings") page = html`<${SettingsPage} key=${me.id} ...${props} />`;
  else if (p.startsWith("/admin") && me.role !== "admin") page = html`<${Empty} title="このページを表示する権限がありません">管理者（管理 花子）に切り替えると見られます。<//>`;
  else if (p === "/admin/reviews") page = html`<${ReviewsPage} ...${props} />`;
  else if ((m = p.match(/^\/admin\/reviews\/([^/]+)$/))) page = html`<${ReviewPage} key=${m[1]} ...${props} versionId=${m[1]} />`;
  else if (p === "/admin/articles") page = html`<${AdminArticlesPage} ...${props} />`;
  else if ((m = p.match(/^\/admin\/articles\/([^/]+)\/versions$/))) page = html`<${HistoryPage} ...${props} articleId=${m[1]} />`;
  else if (p === "/admin/audit-logs") page = html`<${AuditPage} ...${props} />`;
  else page = html`<${Empty} title="ページが見つかりません" />`;

  return html`<${Shell} state=${state} me=${me} route=${route} actions=${actions}>${page}<//>`;
}

// 「読み込み中…」の表示を消してから描画する（Preact は元からある中身を残すため）
const root = document.getElementById("app");
root.textContent = "";
render(html`<${App} />`, root);
