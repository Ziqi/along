import { useEffect, useRef, useState } from "react";
import { ArrowDown, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catchUp } from "@/lib/engine";
import { CATCH_UP_MIN_LINES } from "@/lib/engine/structure-runtime";
import { formatClock } from "@/lib/utils";
import { useCapcom } from "@/lib/store";

/** Within this many pixels of the bottom counts as "reading the live end". */
const FOLLOW_SLACK_PX = 48;

export function DownlinkPanel() {
  const captions = useCapcom((s) => s.captions);
  const interim = useCapcom((s) => s.interim);
  const mic = useCapcom((s) => s.mic);
  const listening = useCapcom((s) => s.listening);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const sttBackend = useCapcom((s) => s.sttBackend);
  const sttNote = useCapcom((s) => s.sttNote);
  const recap = useCapcom((s) => s.catchUp);
  const setCatchUp = useCapcom((s) => s.setCatchUp);
  const ping = useCapcom((s) => s.ping);
  const scroller = useRef<HTMLDivElement>(null);
  const live = mic === "live";
  const openClass = sessions.some((s) => s.id === liveId && !s.endedAt);
  const onBrowser = listening && sttBackend === "browser";
  // 「刚才讲了什么」 wants a few minutes of class behind it and one request at a time.
  const canCatchUp = openClass && captions.length >= CATCH_UP_MIN_LINES && !recap?.pending;

  async function askCatchUp() {
    const out = await catchUp();
    if (!out.ok) ping(out.error);
  }
  // Follow the live end until the student scrolls up to read back; then hold
  // still and count what arrived, so one tap brings them back.
  const [following, setFollowing] = useState(true);
  const [seenCount, setSeenCount] = useState(0);
  const unseen = following ? 0 : Math.max(0, captions.length - seenCount);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (following) {
      el.scrollTop = el.scrollHeight;
      setSeenCount(captions.length);
    }
  }, [captions, interim, following]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
    if (nearBottom !== following) {
      setFollowing(nearBottom);
      if (nearBottom) setSeenCount(captions.length);
    }
  }

  function jumpToLive() {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollowing(true);
    setSeenCount(captions.length);
  }

  const empty = captions.length === 0 && !interim;

  return (
    <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
      <span className="hud-corners-bl" />
      <span className="hud-corners-br" />
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="text-sm font-medium max-lg:sr-only">听课</h2>
        {onBrowser ? (
          <span
            className="rounded-sm border border-hold/50 px-1.5 py-0.5 text-xs font-medium text-hold"
            title={sttNote ?? undefined}
          >
            浏览器听写
          </span>
        ) : null}
        {openClass ? (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="ml-auto"
            disabled={!canCatchUp}
            onClick={() => void askCatchUp()}
            title={captions.length < CATCH_UP_MIN_LINES ? "刚才还没听进几句" : undefined}
          >
            <RotateCcw className="size-3.5" />
            {recap?.pending ? "在写…" : "刚才讲了什么"}
          </Button>
        ) : null}
        <div className={"meter " + (openClass ? "" : "ml-auto")} data-live={live} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </header>

      {onBrowser && sttNote ? (
        <p
          className="shrink-0 border-b border-line px-4 py-2 text-sm text-hold text-pretty md:px-5"
          role="status"
        >
          {sttNote}
        </p>
      ) : null}

      {recap && !recap.pending && recap.lines?.length ? (
        // Pinned under the header, not inside the list: the list follows the live end.
        <div className="shrink-0 border-b border-line bg-elevated px-4 py-3 md:px-5" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted">
              刚才讲了什么
              {recap.topic ? <span className="text-fg"> · {recap.topicZh || recap.topic}</span> : null}
            </p>
            <button
              type="button"
              aria-label="收起"
              className="-mr-1 -mt-0.5 p-1 text-dim hover:text-fg"
              onClick={() => setCatchUp(null)}
            >
              <X className="size-3.5" />
            </button>
          </div>
          <ol className="mt-2 flex flex-col gap-1">
            {recap.lines.map((line, i) => (
              <li key={i} className="text-base text-fg text-pretty">
                {i + 1}. {line}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {!following && !empty ? (
          <button
            type="button"
            onClick={jumpToLive}
            className="absolute bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm text-fg shadow-sm hover:bg-fg/5"
          >
            <ArrowDown className="size-3.5" />
            {unseen > 0 ? `回到最新 · ${unseen} 句` : "回到最新"}
          </button>
        ) : null}
        <div
          ref={scroller}
          onScroll={onScroll}
          className="h-full min-h-0 overflow-y-auto px-4 py-5 md:px-5"
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
                    <p className="text-lg text-fg text-pretty break-words">{c.en}</p>
                    <p
                      className={
                        "mt-1 text-base text-pretty break-words " +
                        (c.pending || !/[\u4e00-\u9fff]/.test(c.zh)
                          ? "text-dim"
                          : c.error
                            ? "text-abort"
                            : "text-muted")
                      }
                    >
                      {/[\u4e00-\u9fff]/.test(c.zh) ? c.zh : c.error ? "未译" : "译…"}
                    </p>
                  </div>
                </li>
              ))}
              {interim ? (
                <li className="grid grid-cols-[auto_1fr] gap-x-4">
                  <p className="pt-1 font-mono text-xs tabular-nums text-dim">--:--:--</p>
                  <p className="stream-caret text-lg text-fg/80">{interim}</p>
                </li>
              ) : null}
            </ol>
          )}
        </div>
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
