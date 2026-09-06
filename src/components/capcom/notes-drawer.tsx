import { useEffect, useRef, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapcom } from "@/lib/store";
import { captureNote } from "@/components/capcom/use-engine";
import { formatDayTime } from "@/lib/utils";

export function NotesDrawer() {
  const open = useCapcom((s) => s.bay === "notes");
  const setBay = useCapcom((s) => s.setBay);
  const view = useCapcom((s) => s.view);
  const sessionId = useCapcom((s) => s.sessionId);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const jotsLive = useCapcom((s) => s.jots);
  const patchJot = useCapcom((s) => s.patchJot);
  const removeJot = useCapcom((s) => s.removeJot);
  const ensureSession = useCapcom((s) => s.ensureSession);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sid = view === "recap" ? sessionId : liveId;
  const jots =
    view === "recap"
      ? (sessions.find((s) => s.id === sessionId)?.notes ?? [])
      : jotsLive;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [jots.length, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBay(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setBay]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    if (view !== "recap") ensureSession();
    void captureNote(el.value, "hand");
    el.value = "";
  }

  if (!open) {
    if (view !== "live") return null;
    return (
      <button
        type="button"
        onClick={() => setBay("notes")}
        className="fixed top-1/3 right-0 z-20 border border-r-0 border-line bg-surface px-2 py-3 text-xs tracking-[0.18em] text-muted hover:text-fg"
      >
        笔记
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-[min(22rem,100vw)] flex-col border-l border-line bg-bg pt-[3.25rem] md:pt-[3.5rem]">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="font-mono text-[10px] tracking-[0.2em] text-dim">LOG</span>
        <h2 className="text-xs font-medium">笔记</h2>
        <p className="flex-1 text-[10px] text-dim">可改可删 · Esc</p>
        <Button
          type="button"
          variant="quiet"
          size="icon"
          aria-label="关闭笔记"
          className="size-7 min-h-7 min-w-7"
          onClick={() => setBay(null)}
        >
          <X className="size-3.5" />
        </Button>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!jots.length ? (
          <p className="text-sm leading-relaxed text-muted">
            {sid ? "还没有笔记。" : "先听课或打开一份纪要。"}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {jots.map((j) => (
              <li key={j.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] tabular-nums text-dim">
                    {formatDayTime(j.at)}
                  </p>
                  <textarea
                    defaultValue={j.en}
                    rows={2}
                    onBlur={(e) => patchJot(j.id, { en: e.target.value, pending: false })}
                    className="mt-1 w-full resize-none bg-transparent text-sm leading-snug text-fg focus:outline-none"
                    placeholder="英文"
                  />
                  <textarea
                    defaultValue={j.zh}
                    rows={2}
                    onBlur={(e) => patchJot(j.id, { zh: e.target.value, pending: false })}
                    className="w-full resize-none bg-transparent text-sm leading-snug text-muted focus:outline-none"
                    placeholder="中文"
                  />
                  {j.pending ? <p className="text-xs text-dim">译…</p> : null}
                </div>
                <Button
                  type="button"
                  variant="quiet"
                  size="icon"
                  aria-label="删笔记"
                  className="size-7 min-h-7 min-w-7"
                  onClick={() => removeJot(j.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        onSubmit={submit}
        className="flex shrink-0 items-end gap-2 border-t border-line px-3 py-2"
      >
        <textarea
          ref={inputRef}
          rows={2}
          className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-dim focus:outline-none"
          placeholder="记一条，中英都行"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            submit(e);
          }}
        />
        <Button type="submit" variant="primary" size="icon" aria-label="记下" className="size-9 min-h-9 min-w-9">
          <Plus className="size-4" />
        </Button>
      </form>
    </aside>
  );
}