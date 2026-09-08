import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deckTally,
  gradeAgain,
  gradeKnown,
  loadMemory,
  orderRound,
  saveMemory,
  type DrillMemory,
} from "@/lib/drill";
import { collectDrillCards, type DrillCard } from "@/lib/recap-kit";
import type { ClassSession } from "@/lib/types";

/**
 * Flash cards from the language points. `classId` scopes the deck to one class;
 * `null` drills every class. The scope lives in the URL, so the parent remounts
 * this deck (by key) whenever it changes. `thisClassId` is what 本堂 goes back
 * to while the deck is on every class.
 *
 * A round is a queue: 会了 takes the card out and this device remembers it for
 * a while; 再来 sends it to the back of the queue, so it is seen again before
 * the round ends. Cards recently known stay out of the next round until due.
 */
export function DrillDeck({
  sessions,
  classId,
  thisClassId,
  onScope,
}: {
  sessions: ClassSession[];
  classId: string | null;
  thisClassId: string | null;
  onScope: (classId: string | null) => void;
}) {
  const all = classId === null;
  const deck = useMemo(
    () => (all ? collectDrillCards(sessions) : collectDrillCards(sessions, classId)),
    [all, sessions, classId],
  );
  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);
  const [mem, setMem] = useState<DrillMemory>(() => loadMemory());
  const [queue, setQueue] = useState<string[]>(() => orderRound(deck, loadMemory(), Date.now()).map((c) => c.id));
  const [show, setShow] = useState(false);
  const [round, setRound] = useState({ done: 0, known: 0, again: 0 });

  // A recap rewritten mid-round can retire ids; skip them rather than show a blank.
  const live = queue.filter((id) => byId.has(id));
  const card: DrillCard | undefined = live.length ? byId.get(live[0]!) : undefined;
  const memo = card ? mem[card.id] : undefined;

  function grade(verdict: "known" | "again") {
    if (!card) return;
    const now = Date.now();
    const next = verdict === "known" ? gradeKnown(mem, card.id, now) : gradeAgain(mem, card.id, now);
    setMem(next);
    saveMemory(next);
    setShow(false);
    setQueue(verdict === "known" ? live.slice(1) : [...live.slice(1), live[0]!]);
    setRound((r) => ({
      done: r.done + 1,
      known: r.known + (verdict === "known" ? 1 : 0),
      again: r.again + (verdict === "again" ? 1 : 0),
    }));
  }

  function restart(everything: boolean) {
    const ids = everything ? deck.map((c) => c.id) : orderRound(deck, mem, Date.now()).map((c) => c.id);
    setQueue(ids);
    setRound({ done: 0, known: 0, again: 0 });
    setShow(false);
  }

  const scope = (
    <div className="flex flex-wrap items-center gap-2">
      {thisClassId ? (
        <Button type="button" variant={all ? "quiet" : "primary"} size="xs" onClick={() => onScope(thisClassId)}>
          本堂
        </Button>
      ) : null}
      <Button
        type="button"
        variant={all ? "primary" : "quiet"}
        size="xs"
        onClick={() => onScope(null)}
        disabled={!collectDrillCards(sessions).length}
      >
        全部堂次
      </Button>
      {card ? (
        <p className="text-xs text-dim">
          {all ? "跨课" : "这一堂"} · 还剩 {live.length} 张 · {card.kind}
          {memo ? (memo.box > 0 ? " · 上次会了" : memo.seen > 0 ? " · 又回来了" : "") : " · 第一次见"}
        </p>
      ) : null}
    </div>
  );

  if (!deck.length) {
    return (
      <div className="flex flex-col gap-4">
        {scope}
        <p className="text-base text-muted">
          {all ? "还没有可翻的词条。结课整理出语言点之后，这里会有卡。" : "这堂还没有可翻的词条。语言点写完会先抽这一堂，不是跨课词表。"}
        </p>
      </div>
    );
  }

  if (!card) {
    const t = deckTally(deck, mem);
    const dueNow = orderRound(deck, mem, Date.now()).length;
    return (
      <div className="flex flex-col gap-6">
        {scope}
        <div className="flex flex-col gap-2 border border-line px-5 py-8">
          <p className="text-xl font-medium tracking-tight text-fg">
            {round.done ? "这一轮翻完了。" : "最近都会了。"}
          </p>
          <p className="text-base text-muted">
            {round.done ? `翻了 ${round.done} 次：会了 ${round.known}，再来 ${round.again}。` : null}
            {` 这套 ${t.total} 张：记住 ${t.known}，还生 ${t.again}，没翻过 ${t.unseen}。`}
            {dueNow ? "" : " 记住的卡过几天再到期。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dueNow ? (
            <Button type="button" variant="primary" size="lg" onClick={() => restart(false)}>
              再翻一轮
            </Button>
          ) : null}
          <Button type="button" variant={dueNow ? "quiet" : "primary"} size="lg" onClick={() => restart(true)}>
            全部再翻一遍
          </Button>
        </div>
      </div>
    );
  }

  const back = [
    { key: "zh", text: card.zh, cls: "text-base text-fg" },
    { key: "use", text: card.useZh || card.use, cls: "text-sm text-muted" },
    { key: "example", text: card.example, cls: "text-base text-fg" },
    { key: "exampleZh", text: card.exampleZh, cls: "text-sm text-muted" },
  ].filter((l) => l.text && l.text.trim());

  return (
    <div className="flex flex-col gap-6">
      {scope}
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        className="min-h-40 border border-line px-5 py-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
      >
        <p className="text-xl font-medium tracking-tight text-pretty">{card.en}</p>
        {show ? (
          <div className="mt-4 flex flex-col gap-1">
            {back.map((line) => (
              <p key={line.key} className={line.cls + " text-pretty"}>
                {line.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-dim">点开看中文、用法和例句</p>
        )}
      </button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="lg" onClick={() => setShow((v) => !v)}>
          {show ? "看正面" : "看背面"}
        </Button>
        <Button type="button" variant="primary" size="lg" onClick={() => grade("known")}>
          会了
        </Button>
        <Button type="button" variant="quiet" size="lg" onClick={() => grade("again")}>
          再来
        </Button>
      </div>
    </div>
  );
}
