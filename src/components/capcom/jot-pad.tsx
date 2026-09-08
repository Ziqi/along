import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useCapcom } from "@/lib/store";
import { captureNote, sayLine } from "@/lib/engine";
import { cn } from "@/lib/utils";

/**
 * The pad that N opens in class. Two faces: 记要点 keeps a line for the
 * handout; 我想说 turns a Chinese thought into one English line to say now,
 * and keeps that too.
 */
export function JotPad() {
  const open = useCapcom((s) => s.jotOpen);
  const mode = useCapcom((s) => s.jotMode);
  const setJotOpen = useCapcom((s) => s.setJotOpen);
  if (!open) return null;

  const close = () => setJotOpen(false);
  return (
    <Sheet label={mode === "say" ? "我想说" : "记一条要点"} onClose={close}>
      <div role="tablist" aria-label="记什么" className="-mt-1 mb-3 flex gap-1 border-b border-line">
        <Tab on={mode === "note"} onClick={() => setJotOpen(true, "note")}>
          记要点
        </Tab>
        <Tab on={mode === "say"} onClick={() => setJotOpen(true, "say")}>
          我想说
        </Tab>
      </div>
      {mode === "say" ? <SayFace onClose={close} /> : <NoteFace onClose={close} />}
    </Sheet>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "-mb-px h-9 border-b-2 px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40",
        on ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function NoteFace({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text) return;
    void captureNote(text, "hand");
    el.value = "";
    onClose();
  }

  return (
    <form onSubmit={submit}>
      <p className="text-xs text-muted">写中文或英文，回车记入当前这堂纪要。</p>
      <textarea
        ref={inputRef}
        autoFocus
        data-autofocus
        rows={4}
        className="mt-3 w-full resize-none border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none"
        placeholder="例如：compound interest 复利"
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit(e);
        }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="quiet" size="lg" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" variant="primary" size="lg">
          记入纪要
        </Button>
      </div>
    </form>
  );
}

function SayFace({ onClose }: { onClose: () => void }) {
  const jots = useCapcom((s) => s.jots);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The newest line asked for, pending or written, so it can be read out loud.
  const last = [...jots].reverse().find((j) => j.src === "say");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el || busy) return;
    const text = el.value.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const result = await sayLine(text);
    setBusy(false);
    if (result.ok) {
      el.value = "";
    } else {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="text-xs text-muted">用中文写你想说的，回车。出一句这堂课能开口的英文，并记入纪要。</p>
      {last ? (
        <div className="mt-3 border border-line bg-surface px-3 py-3" aria-live="polite">
          {last.pending ? (
            <p className="text-lg text-muted">在想…</p>
          ) : last.en ? (
            <p className="text-lg text-fg text-pretty">{last.en}</p>
          ) : (
            <p className="text-lg text-muted">没写出来。</p>
          )}
          <p className="mt-1 text-base text-muted text-pretty">{last.zh}</p>
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        autoFocus
        data-autofocus
        rows={3}
        className="mt-3 w-full resize-none border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none"
        placeholder="例如：我更愿意用 app 记账，因为看得见每一笔"
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          void submit(e);
        }}
      />
      {error ? <p className="mt-2 text-sm text-hold">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="quiet" size="lg" onClick={onClose}>
          {last && !last.pending ? "关掉" : "取消"}
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? "在写" : "写成英文"}
        </Button>
      </div>
    </form>
  );
}
