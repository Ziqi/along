import { useEffect, useRef } from "react";
import { formatClock } from "@/lib/utils";
import { useCapcom } from "@/lib/store";

export function DownlinkPanel() {
  const captions = useCapcom((s) => s.captions);
  const interim = useCapcom((s) => s.interim);
  const mic = useCapcom((s) => s.mic);
  const listening = useCapcom((s) => s.listening);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const scroller = useRef<HTMLDivElement>(null);
  const live = mic === "live";
  const openClass = sessions.some((s) => s.id === liveId && !s.endedAt);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [captions, interim]);

  const empty = captions.length === 0 && !interim;

  return (
    <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
      <span className="hud-corners-bl" />
      <span className="hud-corners-br" />
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="text-sm font-medium">听课</h2>
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
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-5"
      >
        {empty ? (
          <Preflight
            listening={listening}
            arming={listening && mic === "arming"}
            paused={openClass && !listening && mic !== "arming"}
          />
        ) : (
          <ol className="flex flex-col gap-6">
            {captions.map((c) => (
              <li key={c.id} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <p className="pt-1 font-mono text-xs tabular-nums text-dim">
                  {formatClock(c.at)}
                </p>
                <div className="min-w-0">
                  <p className="text-lg text-fg text-pretty">
                    {c.en}
                  </p>
                  <p
                    className={
                      "mt-1 text-base text-pretty " +
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
                <p className="pt-1 font-mono text-xs tabular-nums text-dim">--:--:--</p>
                <p className="stream-caret text-lg text-fg/80">
                  {interim}
                </p>
              </li>
            ) : null}
          </ol>
        )}
      </div>
    </section>
  );
}

function Preflight({
  listening,
  arming,
  paused,
}: {
  listening: boolean;
  arming: boolean;
  paused: boolean;
}) {
  const lead = arming
    ? "正在开麦。允许之后，完整一句才会上屏。"
    : listening
      ? "已经在听。完整一句才会上屏。"
      : paused
        ? "听写停着。点继续听，完整一句才会上屏。"
        : "点「开始听」，先选互动、旁听或只听。麦克风开了，完整一句才会上屏。";
  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-base text-muted text-pretty">{lead}</p>
      <p className="text-base text-muted text-pretty">
        暂停不停课。结课立刻进纪要。想换课型，先结课再开一堂。
      </p>
    </div>
  );
}
