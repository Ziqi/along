import { useRef, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapcom } from "@/lib/store";
import { captureNote } from "@/lib/engine";
import type { ClassSession } from "@/lib/types";
import { formatDayTime } from "@/lib/utils";

/** The class notes, editable in place, with a box to add one after the fact. */
export function NotesEditor({ session }: { session: ClassSession }) {
  const patchJot = useCapcom((s) => s.patchJot);
  const removeJot = useCapcom((s) => s.removeJot);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [notesOpen, setNotesOpen] = useState(true);

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    void captureNote(el.value, "hand", undefined, session.id);
    el.value = "";
  }

  return (
    <details className="recap-notes border-t border-line pt-8" open={notesOpen} onToggle={(e) => setNotesOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xl font-medium tracking-tight">
        课堂随手记
        <span className="ml-2 text-sm font-normal text-muted">可补</span>
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        {session.notes.length ? (
          <ul className="flex flex-col gap-5">
            {session.notes.map((j) => (
              <li key={j.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-dim">
                    {formatDayTime(j.at)}
                    {j.src === "say" ? " · 我想说" : j.src === "coach" ? " · 教练" : j.src === "deep" ? " · 检索" : ""}
                  </p>
                  <textarea
                    key={`${j.id}-en-${j.en}`}
                    defaultValue={j.en}
                    rows={2}
                    onBlur={(e) => patchJot(j.id, { en: e.target.value, pending: false })}
                    className="mt-1 w-full resize-none px-2 py-1.5 text-base text-fg"
                    placeholder="英文"
                  />
                  <textarea
                    key={`${j.id}-zh-${j.zh}`}
                    defaultValue={j.zh}
                    rows={2}
                    onBlur={(e) => patchJot(j.id, { zh: e.target.value, pending: false })}
                    className="mt-1 w-full resize-none px-2 py-1.5 text-sm text-muted"
                    placeholder="中文"
                  />
                </div>
                <Button type="button" variant="quiet" size="icon-xs" aria-label="删这条随手记" onClick={() => removeJot(j.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">教练点「记」，或在下面自己写一条。</p>
        )}
        <form onSubmit={submit} className="recap-chrome border border-line bg-surface p-3">
          <label className="text-sm text-muted" htmlFor="recap-jot">
            补一条随手记，中文或英文都可以
          </label>
          <textarea
            id="recap-jot"
            ref={inputRef}
            rows={3}
            className="mt-2 w-full resize-none border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none"
            placeholder="例如：I'd rather use a budgeting app. / 复利要尽早开始"
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              submit(e);
            }}
          />
          <Button type="submit" variant="primary" size="lg" className="mt-2">
            记入纪要
          </Button>
        </form>
      </div>
    </details>
  );
}
