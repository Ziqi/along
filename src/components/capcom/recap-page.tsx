import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkedEn } from "@/components/capcom/marked-en";
import { useCapcom } from "@/lib/store";
import { requestRecap, forkAndRecap } from "@/components/capcom/use-engine";
import type { ClassSession, RecapPair } from "@/lib/types";
import { formatDayTime } from "@/lib/utils";

export function RecapPage() {
  const sessions = useCapcom((s) => s.sessions);
  const sessionId = useCapcom((s) => s.sessionId);
  const setSession = useCapcom((s) => s.setSession);
  const setView = useCapcom((s) => s.setView);
  const renameSession = useCapcom((s) => s.renameSession);
  const removeSession = useCapcom((s) => s.removeSession);
  const updateRecap = useCapcom((s) => s.updateRecap);
  const pending = useCapcom((s) => s.recapPending);
  const error = useCapcom((s) => s.recapError);
  const [mode, setMode] = useState<"read" | "drill">("read");
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  const recap = session?.recap ?? null;
  const sections = recap?.sections ?? [];
  const patterns = recap?.patterns ?? [];
  const lines = recap?.lines ?? [];
  const words = recap?.words ?? [];
  const topics = recap?.topics ?? [];
  const canRun = (session?.transcript?.length ?? 0) >= 2;
  const stats = useMemo(() => tally(sessions), [sessions]);
  const keys = words.map((w) => w.en.split(/\s+/)[0] ?? w.en);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setView("live");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[min(18rem,42vw)] shrink-0 flex-col border-r border-line">
        <div className="flex h-8 items-center justify-between border-b border-line px-3">
          <p className="font-mono text-[10px] tracking-[0.2em] text-dim">纪要</p>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-7 min-h-7 px-2"
            onClick={() => setView("live")}
          >
            回课堂
          </Button>
        </div>
        <div className="border-b border-line px-3 py-3">
          <p className="text-xs leading-relaxed text-muted">
            {stats.classes} 堂 · {stats.topics} 主题 · {stats.patterns} 句式 · {stats.words} 词
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-1">
          {sessions.length ? (
            <ul>
              {sessions.map((s) => (
                <li key={s.id} className="border-b border-line/60">
                  <div
                    className={
                      "flex items-start gap-1 px-2 py-2 " +
                      (s.id === session?.id ? "bg-elevated" : "")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSession(s.id);
                        setMode("read");
                      }}
                      className="min-w-0 flex-1 px-1 py-0.5 text-left"
                    >
                      <span className="block truncate text-sm text-fg">{s.title}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-dim">
                        {formatDayTime(s.startedAt)}
                        {s.endedAt ? "" : " · 进行中"}
                      </span>
                      {s.sourceTitle ? (
                        <span className="mt-0.5 block truncate text-[10px] text-dim">
                          由「{s.sourceTitle}」再出
                        </span>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon"
                      aria-label="删这份纪要"
                      className="size-7 min-h-7 min-w-7"
                      onClick={() => removeSession(s.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted">还没有纪要。结课会自动写一份。</p>
          )}
        </nav>
      </aside>

      <article className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-8 md:px-10 md:py-12">
          {!session ? (
            <p className="text-base text-muted">结课之后，每一堂会成为左边的一条纪要。</p>
          ) : (
            <>
              <header className="flex flex-col gap-3">
                <p className="font-mono text-[10px] tracking-[0.16em] text-dim">
                  {formatDayTime(session.startedAt)}
                  {session.sourceTitle ? ` · 由「${session.sourceTitle}」再出` : ""}
                </p>
                <input
                  key={`${session.id}-${session.title}`}
                  defaultValue={session.title}
                  onBlur={(e) => renameSession(session.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="bg-transparent text-3xl font-medium tracking-tight text-fg text-balance focus:outline-none"
                  aria-label="纪要标题"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    className="h-7 min-h-7 px-2"
                    onClick={() =>
                      void (recap ? forkAndRecap(session.id) : requestRecap(session.id))
                    }
                    disabled={pending || !canRun}
                  >
                    {pending ? "在写" : recap ? "再出一份" : "出纪要"}
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    className="h-7 min-h-7 px-2"
                    onClick={() => setMode(mode === "drill" ? "read" : "drill")}
                    disabled={!stats.cards}
                  >
                    {mode === "drill" ? "看纪要" : "复习"}
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    className="h-7 min-h-7 px-2"
                    onClick={() => removeSession(session.id)}
                  >
                    删除
                  </Button>
                </div>
              </header>

              {mode === "drill" ? (
                <DrillDeck sessions={sessions} currentId={session.id} />
              ) : (
                <>
                  {error && !recap ? <p className="text-sm text-abort">{error}</p> : null}
                  {pending && !recap ? (
                    <p className="text-base leading-relaxed text-muted">正在把本堂写成纪要…</p>
                  ) : null}
                  {!pending && !recap && !error ? (
                    <p className="text-base leading-relaxed text-muted">
                      这份还没有成文。有实录就可以出纪要。
                    </p>
                  ) : null}

                  {recap ? (
                    <>
                      <EditableBlock
                        label="导语"
                        value={recap.lede}
                        onSave={(lede) => updateRecap(session.id, { lede })}
                        large
                      />
                      {sections.map((sec, i) => (
                        <section key={`${sec.heading}-${i}`} className="flex flex-col gap-3">
                          <input
                            defaultValue={sec.heading}
                            key={`${session.id}-h-${i}-${sec.heading}`}
                            onBlur={(e) => {
                              const next = sections.map((s, n) =>
                                n === i ? { ...s, heading: e.target.value } : s,
                              );
                              updateRecap(session.id, { sections: next });
                            }}
                            className="bg-transparent text-xl font-medium tracking-tight text-fg text-balance focus:outline-none"
                          />
                          <textarea
                            defaultValue={sec.body}
                            key={`${session.id}-b-${i}`}
                            rows={Math.min(8, Math.max(3, sec.body.split("\n").length + 1))}
                            onBlur={(e) => {
                              const next = sections.map((s, n) =>
                                n === i ? { ...s, body: e.target.value } : s,
                              );
                              updateRecap(session.id, { sections: next });
                            }}
                            className="resize-none bg-transparent text-base leading-8 text-muted text-pretty focus:outline-none"
                          />
                        </section>
                      ))}
                      {topics.length ? (
                        <Locker kicker="主题" items={topics} keys={keys} />
                      ) : null}
                      <Locker kicker="句式" items={patterns} keys={keys} />
                      <Locker kicker="句子" items={lines} keys={keys} />
                      <Locker kicker="单词" items={words} keys={keys} mark />
                    </>
                  ) : null}

                  <NotesEditor session={session} />
                </>
              )}
            </>
          )}
        </div>
      </article>
    </div>
  );
}

function EditableBlock({
  label,
  value,
  onSave,
  large,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  large?: boolean;
}) {
  if (!value) return null;
  return (
    <section className="flex flex-col gap-2">
      <p className="text-[10px] tracking-[0.16em] text-dim">{label}</p>
      <textarea
        defaultValue={value}
        key={value.slice(0, 24)}
        rows={large ? 4 : 3}
        onBlur={(e) => onSave(e.target.value)}
        className="resize-none bg-transparent text-lg leading-8 text-fg text-pretty focus:outline-none"
      />
    </section>
  );
}

function NotesEditor({ session }: { session: ClassSession }) {
  const patchJot = useCapcom((s) => s.patchJot);
  const removeJot = useCapcom((s) => s.removeJot);
  if (!session.notes.length) return null;
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="text-xl font-medium tracking-tight">笔记</h2>
      <ul className="flex flex-col gap-5">
        {session.notes.map((j) => (
          <li key={j.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] text-dim">{formatDayTime(j.at)}</p>
              <textarea
                defaultValue={j.en}
                rows={2}
                onBlur={(e) => patchJot(j.id, { en: e.target.value, pending: false })}
                className="mt-1 w-full resize-none bg-transparent text-base leading-snug text-fg focus:outline-none"
                placeholder="英文"
              />
              <textarea
                defaultValue={j.zh}
                rows={2}
                onBlur={(e) => patchJot(j.id, { zh: e.target.value, pending: false })}
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-muted focus:outline-none"
                placeholder="中文"
              />
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label="删这条笔记"
              className="size-7 min-h-7 min-w-7"
              onClick={() => removeJot(j.id)}
            >
              <Trash2 className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function tally(sessions: ClassSession[]) {
  const topics = new Set<string>();
  const patterns = new Set<string>();
  const words = new Set<string>();
  let cards = 0;
  for (const s of sessions) {
    for (const t of s.recap?.topics ?? []) if (t.en) topics.add(t.en.toLowerCase());
    for (const t of s.recap?.patterns ?? []) {
      if (t.en) {
        patterns.add(t.en.toLowerCase());
        cards += 1;
      }
    }
    for (const t of s.recap?.lines ?? []) if (t.en) cards += 1;
    for (const t of s.recap?.words ?? []) {
      if (t.en) {
        words.add(t.en.toLowerCase());
        cards += 1;
      }
    }
  }
  return {
    classes: sessions.length,
    topics: topics.size,
    patterns: patterns.size,
    words: words.size,
    cards,
  };
}

function Locker({
  kicker,
  items,
  keys,
  mark,
}: {
  kicker: string;
  items: RecapPair[];
  keys: string[];
  mark?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium tracking-tight">{kicker}</h2>
      <ul className="flex flex-col gap-5">
        {items.map((it) => (
          <li key={it.en || it.zh}>
            <p className="text-lg font-medium leading-snug tracking-tight text-fg text-pretty">
              {mark ? it.en : <MarkedEn text={it.en} keys={keys} />}
            </p>
            {it.zh ? (
              <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">{it.zh}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Drill = { id: string; kind: string; en: string; zh: string };

function collect(sessions: ClassSession[], onlyId?: string): Drill[] {
  const out: Drill[] = [];
  for (const s of sessions) {
    if (onlyId && s.id !== onlyId) continue;
    const recap = s.recap;
    if (!recap) continue;
    for (const [kind, list] of [
      ["句式", recap.patterns ?? []],
      ["句子", recap.lines ?? []],
      ["单词", recap.words ?? []],
    ] as const) {
      for (const it of list) {
        if (!it.en) continue;
        out.push({ id: `${s.id}-${kind}-${it.en}`, kind, en: it.en, zh: it.zh });
      }
    }
  }
  return out;
}

function DrillDeck({
  sessions,
  currentId,
}: {
  sessions: ClassSession[];
  currentId?: string;
}) {
  const [all, setAll] = useState(false);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const deck = collect(sessions, all ? undefined : currentId);
  const card = deck[i];

  useEffect(() => {
    setI(0);
    setShow(false);
  }, [all, currentId]);

  function next() {
    setShow(false);
    setI((n) => (deck.length ? (n + 1) % deck.length : 0));
  }

  if (!deck.length) {
    return <p className="text-base text-muted">这堂还没有可复习的句式、句子或单词。</p>;
  }
  if (!card) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button type="button" variant="quiet" size="sm" className="h-7 min-h-7 px-2" onClick={() => setAll(false)}>
          本堂
        </Button>
        <Button type="button" variant="quiet" size="sm" className="h-7 min-h-7 px-2" onClick={() => setAll(true)}>
          全部堂次
        </Button>
        <p className="text-xs text-dim">
          {i + 1} / {deck.length} · {card.kind}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShow(true)}
        className="min-h-40 border border-line px-5 py-8 text-left"
      >
        <p className="text-xl font-medium leading-snug tracking-tight text-pretty">{card.en}</p>
        {show && card.zh ? (
          <p className="mt-4 text-base leading-relaxed text-muted text-pretty">{card.zh}</p>
        ) : (
          <p className="mt-4 text-sm text-dim">点开看中文</p>
        )}
      </button>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={() => setShow(true)}>
          看中文
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