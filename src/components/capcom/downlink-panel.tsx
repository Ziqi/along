import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/utils";
import { useCapcom } from "@/lib/store";

type Props = {
  onInject: (text: string) => void;
};

export function DownlinkPanel({ onInject }: Props) {
  const captions = useCapcom((s) => s.captions);
  const interim = useCapcom((s) => s.interim);
  const mic = useCapcom((s) => s.mic);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const live = mic === "live";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [captions, interim]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const v = el.value.trim();
    if (!v) return;
    onInject(v);
    el.value = "";
  }

  const empty = captions.length === 0 && !interim;

  return (
    <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
      <span className="hud-corners-bl" />
      <span className="hud-corners-br" />
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-medium">听课</h2>
        </div>
        <div className="meter" data-live={live} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </header>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5"
      >
        {empty ? (
          <Preflight />
        ) : (
          <ol className="flex flex-col gap-5">
            {captions.map((c) => (
              <li key={c.id} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <p className="font-mono text-xs tabular-nums text-dim">
                  {formatClock(c.at)}
                </p>
                <div className="min-w-0">
                  <p className="text-base leading-snug text-fg text-pretty">
                    {c.en}
                  </p>
                  <p
                    className={
                      "mt-1 text-sm leading-snug text-pretty " +
                      (c.pending || !/[\u4e00-\u9fff]/.test(c.zh)
                        ? "text-dim"
                        : c.error
                          ? "text-abort"
                          : "text-muted")
                    }
                  >
                    {/[\u4e00-\u9fff]/.test(c.zh)
                      ? c.zh
                      : c.error
                        ? "未译"
                        : "译…"}
                  </p>
                </div>
              </li>
            ))}
            {interim ? (
              <li className="grid grid-cols-[auto_1fr] gap-x-4">
                <p className="font-mono text-xs tabular-nums text-dim">--:--:--</p>
                <p className="stream-caret text-base leading-snug text-fg/80">
                  {interim}
                </p>
              </li>
            ) : null}
          </ol>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-line p-3"
      >
        <label className="sr-only" htmlFor="feed-input">
          写入课堂上的一句英文
        </label>
        <input
          id="feed-input"
          ref={inputRef}
          className="h-11 min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-fg placeholder:text-dim focus:outline-none"
          placeholder="手写课堂上的一句英文"
          autoComplete="off"
        />
        <Button type="submit" variant="ghost" size="icon" aria-label="送入">
          <ArrowUp className="size-4" />
        </Button>
      </form>
    </section>
  );
}

function Preflight() {
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm leading-relaxed text-muted text-pretty">
        点「开始听」开一堂新课。暂停不会结课。结课立刻进纪要，下一堂再点「开始听」。
      </p>
      <p className="text-sm leading-relaxed text-muted text-pretty">
        「纪要」课上就能进：实时提纲、刚才听到的、自己记的要点。教练点「记」也进纪要。
      </p>
    </div>
  );
}