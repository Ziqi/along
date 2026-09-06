import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapcom } from "@/lib/store";
import { quickTranslate } from "@/lib/capcom-ai";

export function TranslatePanel() {
  const [q, setQ] = useState("");
  const pads = useCapcom((s) => s.txPads);
  const activeId = useCapcom((s) => s.txActiveId);
  const pending = useCapcom((s) => s.txPending);
  const setTxActive = useCapcom((s) => s.setTxActive);
  const newTxPad = useCapcom((s) => s.newTxPad);
  const pushTxTurn = useCapcom((s) => s.pushTxTurn);
  const setTxPending = useCapcom((s) => s.setTxPending);
  const scroller = useRef<HTMLDivElement>(null);
  const pad = pads.find((t) => t.id === activeId) ?? pads[0];

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [pad?.turns.length, pending]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || pending) return;
    setQ("");
    setTxPending(true);
    const result = await quickTranslate({ data: { text } });
    if (!result.ok) {
      useCapcom.getState().setTxPending(false);
      pushTxTurn({ src: text, out: result.error, dir: "en-zh" });
      return;
    }
    pushTxTurn({ src: text, out: result.out, dir: result.dir });
  }

  return (
    <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
      <span className="hud-corners-bl" />
      <span className="hud-corners-br" />
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-xs font-medium">翻译</h2>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex items-center gap-1">
            {pads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTxActive(t.id)}
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
          aria-label="新一组"
          className="size-7 min-h-7 min-w-7"
          onClick={newTxPad}
        >
          <Plus className="size-4" />
        </Button>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!pad?.turns.length && !pending ? (
          <p className="text-xs text-dim">同一组里一直翻。新一组点 +。</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {pad?.turns.map((t) => (
              <li key={t.id} className="flex flex-col gap-1">
                <p className="text-xs text-dim">
                  {t.dir === "zh-en" ? "中→英" : "英→中"} · {t.src}
                </p>
                <CopyLine text={t.out} />
              </li>
            ))}
            {pending ? <li className="text-xs text-dim">译…</li> : null}
          </ol>
        )}
      </div>
      <form
        onSubmit={(e) => void submit(e)}
        className="flex shrink-0 items-center gap-2 border-t border-line p-3"
      >
        <label className="sr-only" htmlFor="tx-input">
          要翻译的文字
        </label>
        <input
          id="tx-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-fg placeholder:text-dim focus:outline-none"
          placeholder="中或英，回车记下。+ 开新一组"
          autoComplete="off"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          aria-label="翻译"
          disabled={pending || !q.trim()}
        >
          <ArrowUp className="size-4" />
        </Button>
      </form>
    </section>
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
        className="min-h-11 shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "已复制" : "复制"}
      </Button>
    </div>
  );
}
