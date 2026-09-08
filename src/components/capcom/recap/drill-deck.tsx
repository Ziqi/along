import { useState } from "react";
import { Button } from "@/components/ui/button";
import { collectDrillCards } from "@/lib/recap-kit";
import type { ClassSession } from "@/lib/types";

/**
 * Flash cards from the language points. `classId` scopes the deck to one class;
 * `null` drills every class. The scope lives in the URL, so the parent remounts
 * this deck (by key) whenever it changes. `thisClassId` is what 本堂 goes back
 * to while the deck is on every class.
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
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const all = classId === null;
  const deck = all ? collectDrillCards(sessions) : collectDrillCards(sessions, classId);
  const card = deck[i];
  const back = card ? [card.zh, card.useZh || card.use, card.example].filter((x) => x && x.trim()) : [];

  function next() {
    setShow(false);
    setI((n) => (deck.length ? (n + 1) % deck.length : 0));
  }

  const scope = (
    <div className="flex items-center gap-2">
      {thisClassId ? (
        <Button
          type="button"
          variant={all ? "quiet" : "arm"}
          size="sm"
          className="h-7 min-h-7 px-2"
          onClick={() => onScope(thisClassId)}
        >
          本堂
        </Button>
      ) : null}
      <Button
        type="button"
        variant={all ? "arm" : "quiet"}
        size="sm"
        className="h-7 min-h-7 px-2"
        onClick={() => onScope(null)}
        disabled={!collectDrillCards(sessions).length}
      >
        全部堂次
      </Button>
      {card ? (
        <p className="text-xs text-dim">
          {all ? "跨课" : "这一堂"} · {i + 1} / {deck.length} · {card.kind}
        </p>
      ) : null}
    </div>
  );

  if (!card) {
    return (
      <div className="flex flex-col gap-4">
        {scope}
        <p className="text-base text-muted">
          {all ? "还没有可翻的词条。结课整理出语言点之后，这里会有卡。" : "这堂还没有可翻的词条。语言点写完会先抽这一堂，不是跨课词表。"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {scope}
      <button type="button" onClick={() => setShow(true)} className="min-h-40 border border-line px-5 py-8 text-left">
        <p className="text-xl font-medium leading-snug tracking-tight text-pretty">{card.en}</p>
        {show ? (
          <div className="mt-4 flex flex-col gap-2">
            {back.map((line) => (
              <p key={line} className="text-base leading-relaxed text-muted text-pretty">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-dim">点开看中文和用法</p>
        )}
      </button>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={() => setShow(true)}>
          看背面
        </Button>
        <Button type="button" variant="arm" size="lg" onClick={next}>
          会了
        </Button>
        <Button type="button" variant="quiet" size="lg" onClick={next}>
          再来
        </Button>
      </div>
    </div>
  );
}
