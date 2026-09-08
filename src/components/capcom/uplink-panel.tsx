import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCapcom } from "@/lib/store";
import type { CoachCard, CoachOption, TopicEssay } from "@/lib/types";
import { captureNote, requestCoach, requestEssay, setCoachLive } from "@/lib/engine";
import { MarkedEn } from "@/components/capcom/marked-en";
import { essayOf } from "@/lib/recap-kit";
import {
  isSpeakMode,
  isStudyCard,
  parseClassMode,
  topicBeatLabel,
} from "@/lib/class-mode";
import { coachEmptyCopy, coachFailHint, coachHeaderLabel, coachUiPhase } from "@/lib/coach-kit";

function cardHasDeep(
  id: string | null,
  coaches: CoachCard[],
  essays: Record<string, TopicEssay>,
  essayPending: boolean,
  essayTarget: string | null,
) {
  if (!id) return false;
  const card = coaches.find((c) => c.id === id);
  if (!card) return false;
  if (essayOf(card, essays)) return true;
  return Boolean(essayPending && essayTarget === id);
}

export function UplinkPanel() {
  const coaches = useCapcom((s) => s.coaches);
  const pending = useCapcom((s) => s.coachPending);
  const error = useCapcom((s) => s.coachError);
  const essays = useCapcom((s) => s.essays);
  const essayPending = useCapcom((s) => s.essayPending);
  const essayTarget = useCapcom((s) => s.essayTarget);
  const essayError = useCapcom((s) => s.essayError);
  const captions = useCapcom((s) => s.captions);
  const autoCoach = useCapcom((s) => s.autoCoach);
  const classMode = useCapcom((s) => s.classMode);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const mode = parseClassMode(
    sessions.find((s) => s.id === liveId)?.classMode ?? classMode,
  );
  const latest = coaches.at(-1) ?? null;
  const scroller = useRef<HTMLDivElement>(null);
  const [followLatest, setFollowLatest] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const stayOnCard =
    !followLatest ||
    (Boolean(activeId && activeId !== latest?.id) &&
      cardHasDeep(activeId, coaches, essays, essayPending, essayTarget));

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
      setFollowLatest(nearBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el || stayOnCard || !followLatest) return;
    el.scrollTop = el.scrollHeight;
  }, [coaches.length, stayOnCard, followLatest]);

  const latestId = latest?.id ?? null;
  useEffect(() => {
    if (!latestId) return;
    if (stayOnCard || !followLatest) return;
    setActiveId(latestId);
  }, [latestId, stayOnCard, followLatest]);

  const phase = coachUiPhase({
    autoCoach,
    pending,
    error,
    hasCard: Boolean(latest),
    hasCaptions: captions.length > 0,
  });
  const headerStatus = coachHeaderLabel(phase);
  const canRewrite = Boolean(error && !pending && (latest || captions.length));
  const failHint = coachFailHint(autoCoach);

  return (
    <section className="hud-corners flex h-full min-h-0 min-w-0 flex-col border border-line bg-surface">
      <span className="hud-corners-bl" />
      <span className="hud-corners-br" />
      <header className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="text-sm font-medium">教练</h2>
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-8 min-h-8 px-2"
            onClick={() => setCoachLive(!autoCoach)}
          >
            {autoCoach ? <Pause className="size-3" /> : <Play className="size-3" />}
            {autoCoach ? "停写" : "跟听"}
          </Button>
          <p className="pl-1 text-xs text-dim">{headerStatus}</p>
        </div>
      </header>
      {coaches.length ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
          {coaches.map((card, i) => {
            const deep = Boolean(essayOf(card, essays));
            const on = card.id === (activeId ?? latest?.id);
            return (
              <button
                key={card.id}
                type="button"
                className={
                  "flex shrink-0 items-center gap-1 px-2 py-1 text-sm " +
                  (on ? "text-fg" : "text-muted hover:text-fg")
                }
                onClick={() => {
                  setFollowLatest(card.id === latest?.id);
                  setActiveId(card.id);
                  document.getElementById(`coach-${card.id}`)?.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                }}
              >
                <span className="max-w-[9rem] truncate">
                  {topicBeatLabel(card.topic || `主题 ${i + 1}`, coaches, card.id)}
                </span>
                {deep ? <span className="text-xs text-dim">深</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
        {!latest && phase === "failed" ? (
          <div className="flex h-full min-h-24 flex-col gap-3">
            <p className="max-w-sm text-base leading-relaxed text-abort text-pretty">{error}</p>
            {failHint ? <p className="max-w-sm text-sm text-muted text-pretty">{failHint}</p> : null}
            {canRewrite ? (
              <Button type="button" variant="ghost" size="lg" className="self-start" onClick={() => void requestCoach()}>
                重写
              </Button>
            ) : null}
          </div>
        ) : !latest ? (
          <div className="flex h-full min-h-24 flex-col gap-3">
            <p className="max-w-sm text-base leading-relaxed text-muted text-pretty">
              {!liveId && phase === "idle"
                ? "点「开始听」先选互动、旁听或只听。选完教练按课型写。上课不能改课型。"
                : coachEmptyCopy(phase, mode)}
            </p>
            {error && phase !== "writing" && phase !== "retrying" ? (
              <p className="max-w-sm text-sm text-muted text-pretty">{error}</p>
            ) : null}
          </div>
        ) : (
          <ol className="flex flex-col gap-5">
            {coaches.map((card) => {
              const essay = essayOf(card, essays);
              const deepPending = Boolean(essay?.draft) || (essayPending && essayTarget === card.id);
              const deepErr = essayError && (essayTarget === card.id || !essayTarget);
              const ready = Boolean(essay && !essay.draft);
              return (
                <li id={`coach-${card.id}`} key={card.id} className="border border-line bg-elevated/40">
                  <div className="px-4 py-5 md:px-5">
                    <CoachBlock
                      card={card}
                      classMode={mode}
                      deepPending={deepPending}
                      busy={deepPending}
                      onDeep={() => {
                        setFollowLatest(false);
                        setActiveId(card.id);
                        void requestEssay(card.id);
                      }}
                      onJot={(text) => {
                        const hit = [...card.options, ...(card.extras ?? [])].find(
                          (o) => o.en === text,
                        );
                        void captureNote(text, "coach", { en: text, zh: hit?.zh });
                      }}
                    />
                  </div>
                  {ready || deepPending || deepErr || essay?.draft ? (
                    <div className="border-t border-line bg-elevated px-4 py-5 md:px-5">
                      {deepPending || essay?.draft ? (
                        <p className="text-sm text-muted">
                          {isSpeakMode(card.mode ?? mode)
                            ? "正在检索：事实、案例、一段能讲四十秒的话。不是把上面三条再写长。"
                            : "正在检索这一拍的背景和资料。不是把剖析再写长。"}
                        </p>
                      ) : null}
                      {ready && essay ? (
                        <EssayBlock
                          essay={essay}
                          listen={!isSpeakMode(card.mode ?? mode)}
                          onJot={(text) => void captureNote(text, "deep", { en: text })}
                        />
                      ) : deepErr && !ready ? (
                        <p className="mt-2 text-sm text-abort">{essayError}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {pending ? (
              <li className="text-xs text-dim">{phase === "retrying" ? "正在重写…" : "写…"}</li>
            ) : null}
            {phase === "failed" && error ? (
              <li className="flex flex-col items-start gap-2">
                <p className="text-sm text-abort">{error}</p>
                {failHint ? <p className="text-sm text-muted">{failHint}</p> : null}
                {canRewrite ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void requestCoach()}>
                    重写
                  </Button>
                ) : null}
              </li>
            ) : null}
          </ol>
        )}
      </div>
    </section>
  );
}

function CoachBlock({
  card,
  classMode,
  deepPending,
  busy,
  onDeep,
  onJot,
}: {
  card: CoachCard;
  classMode: ReturnType<typeof parseClassMode>;
  deepPending: boolean;
  busy: boolean;
  onDeep: () => void;
  onJot: (text: string) => void;
}) {
  const study = isStudyCard(card);
  const audit = (card.mode ?? classMode) === "audit";
  const kicker = study
    ? "这一拍"
    : audit
      ? card.move === "answer"
        ? "若要开口 · 直接答 / 补一层 / 举个例"
        : "若要开口 · 同意 / 对比 / 例子"
      : card.move === "answer"
        ? "直接答 / 补一层 / 举个例"
        : "同意 / 对比 / 例子";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted">{kicker}</p>
          <p className="mt-1 text-lg font-medium tracking-tight text-fg">
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
          className="h-8 min-h-8 px-2"
          onClick={onDeep}
          disabled={busy}
        >
          {deepPending ? "检索中" : "DeepSearch"}
        </Button>
      </div>
      {card.briefZh || card.briefEn ? (
        <div>
          <p className="text-xs text-dim">概括</p>
          {card.briefEn ? (
            <p className="mt-1 text-sm leading-relaxed text-fg text-pretty">{card.briefEn}</p>
          ) : null}
          {card.briefZh ? (
            <p className="mt-0.5 text-sm leading-relaxed text-muted text-pretty">{card.briefZh}</p>
          ) : null}
        </div>
      ) : null}
      {study ? (
        <div className="flex flex-col gap-5">
          {card.options.map((opt, i) => (
            <ListenBeat
              key={`${card.id}-o-${i}`}
              option={opt}
              index={i}
              onJot={() => onJot(opt.en)}
            />
          ))}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {card.options.map((opt, i) => (
            <li key={`${card.id}-o-${i}`}>
              <OptionRow n={i + 1} option={opt} onJot={() => onJot(opt.en)} />
            </li>
          ))}
        </ol>
      )}
      {card.extras?.length && !study ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">扩展 · 把话题推远一点</p>
          {card.extras.map((opt, i) => (
            <OptionRow
              key={`${card.id}-x-${i}`}
              n={card.options.length + i + 1}
              option={opt}
              onJot={() => onJot(opt.en)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function listenKind(label: string, index: number): "quote" | "note" | "aside" {
  if (/背景/.test(label)) return "aside";
  if (/这句/.test(label) || index === 0) return "quote";
  return "note";
}

function ListenBeat({
  option,
  index,
  onJot,
}: {
  option: CoachOption;
  index: number;
  onJot: () => void;
}) {
  const kind = listenKind(option.label, index);
  return (
    <div
      className={
        kind === "quote"
          ? "border-l-2 border-fg/25 pl-4"
          : kind === "aside"
            ? "pl-1"
            : "border-l border-line pl-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{option.label}</p>
        <LineActions text={option.en} onJot={onJot} />
      </div>
      <p
        className={
          kind === "quote"
            ? "mt-1.5 text-pretty text-xl font-medium leading-snug tracking-tight text-fg"
            : kind === "aside"
              ? "mt-1 text-pretty text-sm leading-relaxed text-muted"
              : "mt-1.5 text-pretty text-base leading-relaxed text-fg"
        }
      >
        <MarkedEn text={option.en} keys={option.keys} />
      </p>
      {option.zh ? (
        <p
          className={
            "mt-1 text-pretty " +
            (kind === "aside" ? "text-sm text-dim" : "text-sm leading-relaxed text-muted")
          }
        >
          {option.zh}
        </p>
      ) : null}
    </div>
  );
}

function EssayBlock({
  essay,
  listen,
  onJot,
}: {
  essay: TopicEssay;
  listen?: boolean;
  onJot: (text: string) => void;
}) {
  return (
    <article className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {listen
          ? `DeepSearch · 背景和资料`
          : `DeepSearch · 事实 + 四十秒发言`}
      </p>
      {essay.title ? (
        <h3 className="text-lg font-medium tracking-tight">{essay.title}</h3>
      ) : null}
      {essay.contextEn ? (
        <div>
          <p className="text-sm text-muted">背景</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-fg text-pretty">
            {essay.contextEn}
          </p>
          {essay.contextZh ? (
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted text-pretty">
              {essay.contextZh}
            </p>
          ) : null}
        </div>
      ) : null}
      {essay.viewEn ? (
        <LineBlock kicker="观点" text={essay.viewEn} onJot={() => onJot(essay.viewEn)} />
      ) : null}
      {essay.viewZh ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted text-pretty">
          {essay.viewZh}
        </p>
      ) : null}
      {essay.angles?.length ? (
        <PairStack kicker="另一面" items={essay.angles} />
      ) : null}
      {essay.facts?.length ? (
        <PairStack kicker="事实" items={essay.facts} />
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
      {essay.frames?.length ? (
        <PairStack kicker="句式" items={essay.frames} />
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
      {essay.sources?.length ? (
        <ul className="space-y-1">
          {essay.sources.map((s) => (
            <li key={s.en} className="text-xs text-dim">
              {s.en}
              {s.zh ? ` · ${s.zh}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function PairStack({
  kicker,
  items,
}: {
  kicker: string;
  items: { en: string; zh: string }[];
}) {
  return (
    <div>
      <p className="text-sm text-muted">{kicker}</p>
      <ol className="mt-1 list-decimal space-y-2 pl-5">
        {items.map((it) => (
          <li key={it.en} className="pl-1">
            <p className="text-sm leading-relaxed text-fg">{it.en}</p>
            {it.zh ? <p className="text-sm leading-relaxed text-muted">{it.zh}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LineActions({ text, onJot }: { text: string; onJot?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <div className="flex items-center">
      {onJot ? (
        <Button type="button" variant="quiet" size="sm" className="h-8 min-h-8 px-2" onClick={onJot}>
          记
        </Button>
      ) : null}
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="h-8 min-h-8 px-2"
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

function OptionRow({
  n,
  option,
  onJot,
}: {
  n: number;
  option: CoachOption;
  onJot: () => void;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 w-4 shrink-0 font-mono text-sm text-dim">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{option.label}</p>
          <LineActions text={option.en} onJot={onJot} />
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
  if (!text) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{kicker}</p>
        <LineActions text={text} onJot={onJot} />
      </div>
      <p className="mt-1.5 text-pretty text-base font-medium leading-snug tracking-tight text-fg">
        {text}
      </p>
    </div>
  );
}
