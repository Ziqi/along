import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Check, Copy, Plus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatFrame } from "@/components/capcom/float-frame";
import { useCapcom } from "@/lib/store";
import { requestAsk } from "@/components/capcom/use-engine";

export function AskPanel() {
  const open = useCapcom((s) => s.askOpen);
  const setAskOpen = useCapcom((s) => s.setAskOpen);

  return (
    <>
      <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
        <span className="hud-corners-bl" />
        <span className="hud-corners-br" />
        <AskBody docked onExpand={() => setAskOpen(true)} />
      </section>
      {open ? (
        <FloatFrame
          title="AI对话"
          storageKey="along.ask.frame"
          onClose={() => setAskOpen(false)}
        >
          <AskBody docked={false} onExpand={() => setAskOpen(false)} />
        </FloatFrame>
      ) : null}
    </>
  );
}

function AskBody({
  docked,
  onExpand,
}: {
  docked: boolean;
  onExpand: () => void;
}) {
  const [q, setQ] = useState("");
  const threads = useCapcom((s) => s.askThreads);
  const activeId = useCapcom((s) => s.askActiveId);
  const pending = useCapcom((s) => s.askPending);
  const error = useCapcom((s) => s.askError);
  const setAskActive = useCapcom((s) => s.setAskActive);
  const newAskThread = useCapcom((s) => s.newAskThread);
  const scroller = useRef<HTMLDivElement>(null);
  const thread = threads.find((t) => t.id === activeId) ?? threads[0];

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread?.turns.length, pending]);

  function send() {
    const text = q.trim();
    if (!text || pending) return;
    setQ("");
    void requestAsk(text);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    send();
  }

  const lastMs = thread?.turns.at(-1)?.latencyMs;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3">
        {docked ? (
          <>
            <h2 className="text-xs font-medium">AI对话</h2>
          </>
        ) : null}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex items-center gap-1">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAskActive(t.id)}
                className={
                  "h-7 max-w-[9rem] truncate px-2 text-xs " +
                  (t.id === activeId ? "text-fg" : "text-dim hover:text-muted")
                }
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="quiet"
          size="icon"
          aria-label="新话题"
          className="size-7 min-h-7 min-w-7"
          onClick={newAskThread}
        >
          <Plus className="size-3.5" />
        </Button>
        {docked ? (
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label="弹出"
            className="size-7 min-h-7 min-w-7"
            onClick={onExpand}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        ) : null}
        <p className="hidden text-[10px] tabular-nums text-dim sm:block">
          {pending ? "答…" : lastMs != null ? `${lastMs} 毫秒` : "FLASH"}
        </p>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-4">
        {!thread?.turns.length && !pending && !error ? (
          <p className="text-xs text-dim">
            想说的、想问的都写这里。中英对照，能拿到课堂上讲。
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {thread?.turns.map((t) => (
              <li key={t.id} className="flex flex-col gap-1.5">
                <p className="text-[10px] text-dim">{t.q}</p>
                {t.zh ? (
                  <p className="text-sm leading-relaxed text-muted text-pretty">{t.zh}</p>
                ) : null}
                {t.en ? <CopyLine text={t.en} /> : null}
              </li>
            ))}
            {pending ? <li className="text-xs text-dim">答…</li> : null}
            {error ? <li className="text-sm text-abort">{error}</li> : null}
          </ol>
        )}
      </div>
      <form
        onSubmit={submit}
        className="flex shrink-0 items-end gap-2 border-t border-line px-2 py-2"
      >
        <label className="sr-only" htmlFor={docked ? "ask-input" : "ask-input-open"}>
          继续问
        </label>
        <textarea
          id={docked ? "ask-input" : "ask-input-open"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          rows={docked ? 2 : 3}
          className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-dim focus:outline-none"
          placeholder="想问或想说，回车发送"
          autoComplete="off"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          aria-label="提问"
          disabled={pending || !q.trim()}
          className="size-9 min-h-9 min-w-9"
        >
          <ArrowUp className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm leading-snug text-fg text-pretty">{text}</p>
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="h-7 min-h-7 shrink-0 px-2"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "已复制" : "复制"}
      </Button>
    </div>
  );
}