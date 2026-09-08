import { useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useCapcom } from "@/lib/store";
import { captureNote } from "@/lib/engine";

export function JotPad() {
  const open = useCapcom((s) => s.jotOpen);
  const setJotOpen = useCapcom((s) => s.setJotOpen);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text) return;
    void captureNote(text, "hand");
    el.value = "";
    setJotOpen(false);
  }

  return (
    <Sheet label="记一条要点" onClose={() => setJotOpen(false)}>
      <form onSubmit={submit}>
        <p className="text-sm font-medium">记一条要点</p>
        <p className="mt-1 text-xs text-muted">写中文或英文，回车记入当前这堂纪要。</p>
        <textarea
          ref={inputRef}
          data-autofocus
          rows={4}
          className="mt-3 w-full resize-none border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none"
          placeholder="例如：compound interest 复利 / 我想说 I'd rather use an app"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            submit(e);
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="quiet" size="lg" onClick={() => setJotOpen(false)}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="lg">
            记入纪要
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
