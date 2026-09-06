import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapcom } from "@/lib/store";
import type { CoachCard, CoachOption, TopicEssay } from "@/lib/types";
import { requestEssay, setCoachLive, captureNote } from "@/components/capcom/use-engine";
import { MarkedEn } from "@/components/capcom/marked-en";

export function UplinkPanel() {
  const coaches = useCapcom((s) => s.coaches);
  const pending = useCapcom((s) => s.coachPending);
  const error = useCapcom((s) => s.coachError);
  const essays = useCapcom((s) => s.essays);
  const essayPending = useCapcom((s) => s.essayPending);
  const essayTarget = useCapcom((s) => s.essayTarget);
  const captions = useCapcom((s) => s.captions);
  const autoCoach = useCapcom((s) => s.autoCoach);
  const latest = coaches.at(-1) ?? null;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [coaches.length, essayPending]);

  const headerStatus = pending
    ? "写…"
    : latest
      ? `${latest.latencyMs} 毫秒`
      : "待命";

  const empty = coaches.length === 0 && !error;

  return (
    <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
      <span className="hud-corners-bl" />
      <span className="hud-corners-br" />
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-medium">教练</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-7 min-h-7 px-2"
            onClick={() => setCoachLive(!autoCoach)}
          >
            {autoCoach ? <Pause className="size-3" /> : <Play className="size-3" />}
            {autoCoach ? "暂停" : "跟听"}
          </Button>
          {latest || captions.length ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 min-h-7 px-2"
              onClick={() => void requestEssay(latest?.id)}
              disabled={essayPending}
            >
              {essayPending ? "检索中" : "DeepSearch"}
            </Button>
          ) : null}
          <p className="pl-1 text-[10px] tabular-nums text-dim">
            {autoCoach ? headerStatus : "已暂停"}
          </p>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-4">
        {empty ? (
          <div className="flex h-full min-h-24 flex-col gap-3">
            <p className="text-[10px] tracking-[0.18em] text-dim">
              {pending ? "写…" : "待命"}
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-muted text-pretty">
              主题流往上滚。问句三条回复，讨论接话、追问、例子。重点词会划出来。
            </p>
          </div>
        ) : error && !latest ? (
          <p className="text-sm text-abort">{error}</p>
        ) : (
          <ol className="flex flex-col gap-6">
            {coaches.map((card, i) => (
              <li
                key={card.id}
                className={i < coaches.length - 1 ? "border-b border-line pb-6" : ""}
              >
                <CoachBlock
                  card={card}
                  essay={essays[card.id]}
                  deepPending={essayPending && essayTarget === card.id}
                  onDeep={() => void requestEssay(card.id)}
                  onJot={(text) => {
                    const hit = card.options.find((o) => o.en === text);
                    void captureNote(text, "coach", { en: text, zh: hit?.zh });
                  }}
                  onJotDeep={(text) => void captureNote(text, "deep", { en: text })}
                />
              </li>
            ))}
            {pending ? (
              <li className="text-[10px] tracking-[0.18em] text-dim">写…</li>
            ) : null}
          </ol>
        )}
      </div>
    </section>
  );
}

function CoachBlock({
  card,
  essay,
  deepPending,
  onDeep,
  onJot,
  onJotDeep,
}: {
  card: CoachCard;
  essay?: TopicEssay;
  deepPending: boolean;
  onDeep: () => void;
  onJot: (text: string) => void;
  onJotDeep: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] text-dim">
            {card.move === "join" ? "主题 · 三条参与" : "主题 · 三条回复"}
          </p>
          <p className="mt-1 text-base font-medium tracking-tight text-fg">
            {card.topic || "—"}
          </p>
          {card.topicZh ? (
            <p className="mt-0.5 text-sm text-muted">{card.topicZh}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="h-7 min-h-7 px-2"
          onClick={onDeep}
          disabled={deepPending}
        >
          {deepPending ? "检索中" : "DeepSearch"}
        </Button>
      </div>
      <ol className="flex flex-col gap-3">
        {card.options.map((opt, i) => (
          <li key={`${card.id}-${i}`}>
            <OptionRow
              n={i + 1}
              option={opt}
              onJot={() => onJot(opt.en)}
            />
          </li>
        ))}
      </ol>
      {essay ? <EssayBlock essay={essay} onJot={onJotDeep} /> : null}
    </div>
  );
}

function EssayBlock({
  essay,
  onJot,
}: {
  essay: TopicEssay;
  onJot: (text: string) => void;
}) {
  return (
    <article className="flex flex-col gap-3 border-t border-line pt-3">
      <p className="text-[10px] text-dim">DeepSearch · {essay.latencyMs} 毫秒</p>
      {essay.title ? (
        <h3 className="text-base font-medium tracking-tight">{essay.title}</h3>
      ) : null}
      {essay.viewEn ? (
        <LineBlock kicker="观点" text={essay.viewEn} onJot={() => onJot(essay.viewEn)} />
      ) : null}
      {essay.viewZh ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted text-pretty">
          {essay.viewZh}
        </p>
      ) : null}
      {essay.qEn ? (
        <LineBlock kicker="可以这样问" text={essay.qEn} onJot={() => onJot(essay.qEn)} />
      ) : null}
      {essay.qZh ? (
        <p className="text-sm leading-relaxed text-muted text-pretty">{essay.qZh}</p>
      ) : null}
      {essay.aEn ? (
        <LineBlock kicker="可以这样答" text={essay.aEn} onJot={() => onJot(essay.aEn)} />
      ) : null}
      {essay.aZh ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted text-pretty">
          {essay.aZh}
        </p>
      ) : null}
      {essay.say ? (
        <LineBlock kicker="再跟一句" text={essay.say} onJot={() => onJot(essay.say)} />
      ) : null}
      {essay.terms.length ? (
        <ul className="space-y-1.5">
          {essay.terms.map((term) => (
            <li key={term.en} className="text-sm">
              <span className="text-fg">{term.en}</span>
              {term.zh ? <span className="text-muted"> — {term.zh}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function OptionRow({
  n,
  option,
  onJot,
}: {
  n: number;
  option: CoachOption;
  onJot: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 w-4 shrink-0 font-mono text-xs text-dim">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-dim">{option.label}</p>
          <div className="flex items-center">
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 min-h-7 px-2"
              onClick={onJot}
            >
              记
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 min-h-7 px-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(option.en);
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
        </div>
        <p className="text-pretty text-base font-medium leading-snug tracking-tight text-fg">
          <MarkedEn text={option.en} keys={option.keys} />
        </p>
        {option.zh ? (
          <p className="mt-0.5 text-sm text-muted text-pretty">{option.zh}</p>
        ) : null}
      </div>
    </div>
  );
}

function LineBlock({
  kicker,
  text,
  onJot,
}: {
  kicker: string;
  text: string;
  onJot?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  if (!text) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-dim">{kicker}</p>
        <div className="flex items-center">
          {onJot ? (
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="h-7 min-h-7 px-2"
              onClick={onJot}
            >
              记
            </Button>
          ) : null}
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              } catch {
                /* ignore */
              }
            }}
            className="h-7 min-h-7 px-2"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-pretty text-base font-medium leading-snug tracking-tight text-fg">
        {text}
      </p>
    </div>
  );
}