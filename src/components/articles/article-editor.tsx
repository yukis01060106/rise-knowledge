"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraft } from "@/server/articles/actions";
import { discardDraftAction, submitReviewAction } from "@/server/workflow/actions";
import { buttonClass } from "@/components/ui/button";
import { ARTICLE_TEMPLATES, MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from "@/lib/articles";
import { MAX_TAGS } from "@/lib/tags";

type Props = {
  articleId: string | null;
  initialTitle: string;
  initialBody: string;
  initialTags: string[];
  /** 作業中の版の更新日時（作業中の版がなければ null） */
  initialUpdatedAt: string | null;
  /** 公開済みの記事を編集しているか（保存すると新しい版になる） */
  editingPublished: boolean;
  /** 差し戻された版を修正しているとき、その版番号と理由 */
  rejection: { versionNo: number; reason: string | null } | null;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 2000;
const PREVIEW_DELAY_MS = 400;

const timeFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

export function ArticleEditor(props: Props) {
  const [title, setTitle] = useState(props.initialTitle);
  const [body, setBody] = useState(props.initialBody);
  const [tagsText, setTagsText] = useState(props.initialTags.join(" "));
  const [articleId, setArticleId] = useState(props.articleId);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [previewHtml, setPreviewHtml] = useState("");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(props.initialUpdatedAt !== null);
  const [busy, setBusy] = useState<"submit" | "discard" | null>(null);
  const router = useRouter();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 保存処理は非同期に重なりうるので、最新の値と状態は ref でも持つ
  const latest = useRef({ title, body, tagsText });
  const articleIdRef = useRef(articleId);
  const updatedAtRef = useRef(props.initialUpdatedAt);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const dirtyRef = useRef(false);
  const blockedRef = useRef(false);

  useEffect(() => {
    latest.current = { title, body, tagsText };
  }, [title, body, tagsText]);

  const tagList = tagsText.split(/[\s,、]+/).filter(Boolean);

  /** 1 回分の保存 */
  const saveOnce = useCallback(async (): Promise<void> => {
    const { title, body, tagsText } = latest.current;
    dirtyRef.current = false;
    setSaveState({ kind: "saving" });
    try {
      const result = await saveDraft({
        articleId: articleIdRef.current,
        title,
        bodyMd: body,
        tags: [tagsText],
        expectedUpdatedAt: updatedAtRef.current,
      });
      if (result.ok) {
        updatedAtRef.current = result.updatedAt;
        setHasDraft(true);
        if (!articleIdRef.current) {
          articleIdRef.current = result.articleId;
          setArticleId(result.articleId);
          // 画面を作り直さずに URL だけ編集画面に変える（入力中の内容を失わないため）
          window.history.replaceState(null, "", `/articles/${result.articleId}/edit`);
        }
        setSaveState(dirtyRef.current ? { kind: "dirty" } : { kind: "saved", at: new Date() });
      } else {
        dirtyRef.current = true;
        if (result.code === "conflict" || result.code === "locked" || result.code === "not_found") {
          // 自動保存を止める（再読み込みで最新の状態から編集し直してもらう）
          blockedRef.current = true;
        }
        setSaveState({ kind: "error", message: result.message });
      }
    } catch {
      dirtyRef.current = true;
      setSaveState({ kind: "error", message: "保存に失敗しました。通信状況を確認してください" });
    }
  }, []);

  const save = useCallback(async () => {
    if (blockedRef.current) return;
    // 保存中に呼ばれたら、今の保存が終わってからもう一度保存する
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    const { title, body } = latest.current;
    // まだ何も書いていない新規記事は保存しない
    if (!articleIdRef.current && !title.trim() && !body.trim()) return;

    savingRef.current = true;
    try {
      do {
        pendingRef.current = false;
        await saveOnce();
      } while (pendingRef.current && !blockedRef.current);
    } finally {
      savingRef.current = false;
    }
  }, [saveOnce]);

  /** レビュー申請。未保存の変更があれば先に保存する */
  async function submitForReview() {
    if (!confirm("レビューを申請しますか？申請中は編集できません。")) return;
    setBusy("submit");
    setNotice(null);
    try {
      while (savingRef.current) await new Promise((r) => setTimeout(r, 100));
      // 作業中の下書きがまだない（公開版・差し戻し版を開いただけ）ときも、保存して新しい版を作る
      if (dirtyRef.current || !updatedAtRef.current) await save();
      if (blockedRef.current || dirtyRef.current || !articleIdRef.current) {
        if (!articleIdRef.current) setNotice("タイトルと本文を入力してください");
        return;
      }
      const result = await submitReviewAction(articleIdRef.current);
      if (!result?.ok) {
        setNotice(result?.message ?? "レビューを申請できませんでした");
        return;
      }
      blockedRef.current = true;
      router.push("/me/articles?tab=review");
    } finally {
      setBusy(null);
    }
  }

  /** 下書きの破棄 */
  async function discard() {
    const id = articleIdRef.current;
    if (!id || !confirm("この下書きを破棄しますか？元に戻せません。")) return;
    setBusy("discard");
    try {
      while (savingRef.current) await new Promise((r) => setTimeout(r, 100));
      const result = await discardDraftAction(id);
      if (!result?.ok) {
        setNotice(result?.message ?? "破棄できませんでした");
        return;
      }
      blockedRef.current = true;
      dirtyRef.current = false;
      router.push(result.articleDeleted ? "/me/articles" : `/articles/${id}`);
    } finally {
      setBusy(null);
    }
  }

  // 自動保存：最後の入力から少し待って保存する
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [title, body, tagsText, save]);

  // プレビュー：サーバーで記事表示と同じ変換（サニタイズ込み）をかける
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markdown: body }),
          signal: controller.signal,
        });
        if (res.ok) setPreviewHtml(((await res.json()) as { html: string }).html);
      } catch {
        // 入力が続いて中断された場合など。次の入力でまた更新する
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body]);

  // 未保存のまま閉じようとしたら確認する
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function markDirty() {
    dirtyRef.current = true;
    setSaveState((s) => (s.kind === "error" ? s : { kind: "dirty" }));
  }

  /** カーソル位置にテキストを挿入する */
  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    const current = latest.current.body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + text + current.slice(end);
    setBody(next);
    markDirty();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }

  function insertTemplate(id: string) {
    const template = ARTICLE_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    if (!latest.current.body.trim()) {
      setBody(template.body);
      markDirty();
    } else {
      insertAtCursor(`\n${template.body}`);
    }
  }

  async function uploadImages(files: File[]) {
    for (const file of files) {
      setUploading((n) => n + 1);
      setNotice(null);
      try {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/images", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
        if (res.ok && data.url) {
          const alt = file.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "") || "画像";
          insertAtCursor(`![${alt}](${data.url})\n`);
        } else {
          setNotice(data.message ?? "画像をアップロードできませんでした");
        }
      } catch {
        setNotice("画像をアップロードできませんでした");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function imageFilesOf(list: DataTransferItemList | FileList | null): File[] {
    if (!list) return [];
    const files = list instanceof FileList ? [...list] : [...list].flatMap((i) => (i.kind === "file" ? [i.getAsFile()] : []));
    return files.filter((f): f is File => f !== null && f.type.startsWith("image/"));
  }

  const statusText = {
    idle: articleId ? "保存済み" : "入力すると自動で下書き保存されます",
    dirty: "未保存の変更があります",
    saving: "保存中…",
    saved: saveState.kind === "saved" ? `${timeFormatter.format(saveState.at)} に下書き保存しました` : "",
    error: saveState.kind === "error" ? saveState.message : "",
  }[saveState.kind];

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      {props.rejection && (
        <div role="status" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">v{props.rejection.versionNo} は差し戻されました。修正して、もう一度レビューを申請してください。</p>
          {props.rejection.reason && <p className="mt-1 whitespace-pre-wrap">理由：{props.rejection.reason}</p>}
          <p className="mt-1 text-xs">保存すると新しい版として下書きになります（差し戻された版はそのまま残ります）。</p>
        </div>
      )}
      {props.editingPublished && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          公開中の記事を編集しています。保存すると新しい版として下書きになり、公開中の内容は承認されるまでそのまま表示されます。
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <div className="space-y-2 border-b border-border p-4">
          <label htmlFor="article-title" className="sr-only">
            タイトル
          </label>
          <input
            id="article-title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="タイトル"
            className="w-full bg-transparent text-xl font-bold placeholder:text-gray-400 focus:outline-none sm:text-2xl"
          />
          <label htmlFor="article-tags" className="sr-only">
            タグ
          </label>
          <input
            id="article-tags"
            value={tagsText}
            onChange={(e) => {
              setTagsText(e.target.value);
              markDirty();
            }}
            placeholder={`タグを空白区切りで ${MAX_TAGS} つまで（例：AWS Terraform 初心者向け）`}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-brand focus:bg-surface focus:outline-none"
          />
          {tagList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tagList.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className={`rounded-full px-2.5 py-0.5 text-xs ${i < MAX_TAGS ? "bg-brand-soft text-brand-strong" : "bg-red-50 text-danger line-through"}`}
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm">
          <label className="sr-only" htmlFor="template-select">
            テンプレートを挿入
          </label>
          <select
            id="template-select"
            value=""
            onChange={(e) => insertTemplate(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1"
          >
            <option value="">テンプレートを挿入…</option>
            {ARTICLE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonClass("secondary", "sm")}>
            画像を追加
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              void uploadImages(imageFilesOf(e.target.files));
              e.target.value = "";
            }}
          />
          {uploading > 0 && <span className="text-muted">画像をアップロード中…</span>}
          <div className="ml-auto flex rounded-md border border-border lg:hidden">
            {(["edit", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMobileView(v)}
                aria-pressed={mobileView === v}
                className={`px-3 py-1 ${mobileView === v ? "bg-brand-soft font-semibold text-brand-strong" : "text-muted"}`}
              >
                {v === "edit" ? "入力" : "プレビュー"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2">
          <div className={`${mobileView === "edit" ? "block" : "hidden"} border-border lg:block lg:border-r`}>
            <label htmlFor="article-body" className="sr-only">
              本文（Markdown）
            </label>
            <textarea
              id="article-body"
              ref={textareaRef}
              value={body}
              maxLength={MAX_BODY_LENGTH}
              onChange={(e) => {
                setBody(e.target.value);
                markDirty();
              }}
              onPaste={(e) => {
                const files = imageFilesOf(e.clipboardData.items);
                if (files.length > 0) {
                  e.preventDefault();
                  void uploadImages(files);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const files = imageFilesOf(e.dataTransfer.files);
                if (files.length > 0) {
                  e.preventDefault();
                  void uploadImages(files);
                }
              }}
              placeholder={"Markdown で本文を書きます。画像は貼り付け・ドラッグでも追加できます。\n\n客先名・人名・IP アドレス・パスワードなどの機密情報は書かないでください。"}
              className="block h-[60vh] min-h-80 w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed focus:outline-none"
            />
          </div>
          <div className={`${mobileView === "preview" ? "block" : "hidden"} h-[60vh] min-h-80 overflow-y-auto p-4 lg:block`}>
            {body.trim() ? (
              // /api/preview はサーバーでサニタイズ済みの HTML だけを返す
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <p className="text-sm text-muted">ここにプレビューが表示されます</p>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <p
          role="status"
          className={`text-sm ${saveState.kind === "error" ? "text-danger" : "text-muted"}`}
        >
          {statusText}
        </p>
        <span className="text-xs text-muted">{body.length.toLocaleString()} 文字</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {articleId && hasDraft && (
            <button type="button" onClick={() => void discard()} disabled={busy !== null} className={buttonClass("ghost", "md", "text-danger")}>
              下書きを破棄
            </button>
          )}
          {articleId && (
            <Link href={`/articles/${articleId}`} className={buttonClass("ghost", "md")}>
              記事ページで確認
            </Link>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState.kind === "saving" || busy !== null}
            className={buttonClass("secondary", "md")}
          >
            下書き保存
          </button>
          <button
            type="button"
            onClick={() => void submitForReview()}
            disabled={busy !== null}
            className={buttonClass("primary", "md")}
          >
            {busy === "submit" ? "申請中…" : "レビュー申請"}
          </button>
        </div>
      </div>
    </div>
  );
}
