import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapcom } from "@/lib/store";
import { captureNote } from "@/components/capcom/use-engine";
import { formatDayTime } from "@/lib/utils";
import { useRef, type FormEvent } from "react";

export function NotesPage() {
  const sessions = useCapcom((s) => s.sessions);
  const sessionId = useCapcom((s) => s.sessionId);
  const setSession = useCapcom((s) => s.setSession);
  const setView = useCapcom((s) => s.setView);
  const patchJot = useCapcom((s) => s.patchJot);
  const removeJot = useCapcom((s) => s.removeJot);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listed = sessions.filter((s) => s.notes.length || s.id === sessionId);
  const session =
    sessions.find((s) => s.id === sessionId) ?? listed[0] ?? sessions[0];
  const notes = session?.notes ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el || !session) return;
    setSession(session.id);
    void captureNote(el.value, "hand");
    el.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[min(18rem,42vw)] shrink-0 flex-col border-r border-line">
        <div className="flex h-8 items-center justify-between border-b border-line px-3">
          <p className="text-xs font-medium">笔记</p>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-7 min-h-7 px-2"
            onClick={() => setView("live")}
          >
            回课堂
          </Button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-1">
          {listed.length ? (
            <ul>
              {listed.map((s) => (
                <li key={s.id} className="border-b border-line/60">
                  <button
                    type="button"
                    onClick={() => setSession(s.id)}
                    className={
                      "flex w-full flex-col items-start px-3 py-2 text-left " +
                      (s.id === session?.id ? "bg-elevated text-fg" : "text-muted hover:text-fg")
                    }
                  >
                    <span className="truncate text-sm">{s.title}</span>
                    <span className="mt-0.5 font-mono text-[10px] text-dim">
                      {formatDayTime(s.startedAt)} · {s.notes.length} 条
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted">还没有笔记。听课点「记」，或右侧快速记。</p>
          )}
        </nav>
      </aside>
      <article className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-8 md:px-10 md:py-12">
          {!session ? (
            <p className="text-base text-muted">课堂里记下的都会出现在这里，按堂归类。</p>
          ) : (
            <>
              <header>
                <p className="font-mono text-[10px] text-dim">{formatDayTime(session.startedAt)}</p>
                <h2 className="mt-1 text-3xl font-medium tracking-tight">{session.title}</h2>
              </header>
              {!notes.length ? (
                <p className="text-base text-muted">这堂还没有笔记。</p>
              ) : (
                <ul className="flex flex-col gap-5">
                  {notes.map((j) => (
                    <li key={j.id} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] text-dim">{formatDayTime(j.at)}</p>
                        <textarea
                          defaultValue={j.en}
                          rows={2}
                          onBlur={(e) => patchJot(j.id, { en: e.target.value, pending: false })}
                          className="mt-1 w-full resize-none bg-transparent text-base leading-snug text-fg focus:outline-none"
                          placeholder="英文"
                        />
                        <textarea
                          defaultValue={j.zh}
                          rows={2}
                          onBlur={(e) => patchJot(j.id, { zh: e.target.value, pending: false })}
                          className="w-full resize-none bg-transparent text-sm leading-relaxed text-muted focus:outline-none"
                          placeholder="中文"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="quiet"
                        size="icon"
                        aria-label="删这条笔记"
                        className="size-7 min-h-7 min-w-7"
                        onClick={() => removeJot(j.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={submit} className="border-t border-line pt-4">
                <textarea
                  ref={inputRef}
                  rows={3}
                  className="w-full resize-none bg-transparent text-sm text-fg placeholder:text-dim focus:outline-none"
                  placeholder="记一条，中英都行"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    submit(e);
                  }}
                />
                <Button type="submit" variant="primary" size="lg" className="mt-2">
                  记下
                </Button>
              </form>
            </>
          )}
        </div>
      </article>
    </div>
  );
}