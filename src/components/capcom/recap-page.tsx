import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkedEn } from "@/components/capcom/marked-en";
import { useCapcom } from "@/lib/store";
import { requestRecap, forkAndRecap, captureNote } from "@/components/capcom/use-engine";
import { downloadText, printRecap, recapMarkdown } from "@/lib/export-recap";
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
  const captions = useCapcom((s) => s.captions);
  const [mode, setMode] = useState<"read" | "drill">("read");
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  const recap = session?.recap ?? null;
  const sections = recap?.sections ?? [];
  const patterns = recap?.patterns ?? [];
  const lines = recap?.lines ?? [];
  const words = recap?.words ?? [];
  const topics = recap?.topics ?? [];
  const outline = recap?.outline ?? [];
  const living = Boolean(session && !session.endedAt);
  const canRun = (session?.transcript?.length ?? 0) >= 2 || captions.length >= 2;
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
            <p className="px-3 py-4 text-sm text-muted">上课后这里会出现进行中的纪要。</p>
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
                  {living ? " · 进行中" : ""}
                  {recap?.draft ? " · 实时提纲" : ""}
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
                      void (recap && !recap.draft
                        ? forkAndRecap(session.id)
                        : requestRecap(session.id))
                    }
                    disabled={pending || !canRun}
                  >
                    {pending ? "在写" : recap && !recap.draft ? "再出一份" : "整理本堂"}
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
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    className="h-7 min-h-7 px-2"
                    onClick={() =>
                      downloadText(
                        `${session.title}.md`,
                        recapMarkdown(session),
                        "text/markdown;charset=utf-8",
                      )
                    }
                  >
                    下载 Markdown
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    className="h-7 min-h-7 px-2"
                    onClick={() => printRecap(session)}
                  >
                    下载 PDF
                  </Button>
                </div>
              </header>

              {mode === "drill" ? (
                <DrillDeck sessions={sessions} currentId={session.id} />
              ) : (
                <>
                  {error && !recap ? <p className="text-sm text-abort">{error}</p> : null}
                  {pending && !recap?.lede ? (
                    <p className="text-base leading-relaxed text-muted">正在整理本堂…</p>
                  ) : null}

                  {outline.length ? (
                    <section className="flex flex-col gap-4">
                      <h2 className="text-xl font-medium tracking-tight">提纲</h2>
                      {outline.map((o) => (
                        <div key={o.heading}>
                          <p className="text-base font-medium">{o.heading}</p>
                          {o.bullets.length ? (
                            <ul className="mt-1 flex flex-col gap-1">
                              {o.bullets.map((b) => (
                                <li key={b} className="text-sm leading-relaxed text-muted text-pretty">
                                  {b}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ) : living && !recap ? (
                    <p className="text-base leading-relaxed text-muted">
                      听几句之后，提纲会写在这里。现在就可以记下要点。
                    </p>
                  ) : null}

                  {living ? (
                    <LiveTape
                      lines={
                        captions.length
                          ? captions.map((c) => ({ en: c.en, zh: c.zh }))
                          : session.transcript
                      }
                    />
                  ) : session.transcript.length ? (
                    <LiveTape lines={session.transcript} />
                  ) : null}

                  {recap?.lede || sections.length ? (
                    <>
                      <EditableBlock
                        label="导语"
                        value={recap?.lede ?? ""}
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
                    </>
                  ) : null}

                  {topics.length ? (
                    <Locker kicker="主题" items={topics} keys={keys} />
                  ) : null}
                  <Locker kicker="句式" items={patterns} keys={keys} />
                  <Locker kicker="句子" items={lines} keys={keys} />
                  <Locker kicker="单词" items={words} keys={keys} mark />

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

function LiveTape({ lines }: { lines: { en: string; zh: string }[] }) {
  const shown = lines.filter((l) => l.en);
  if (!shown.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium tracking-tight">实录</h2>
      <p className="text-sm text-muted">课上说的都会记在这里。结课再整理成完整纪要。</p>
      <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto border border-line bg-surface px-4 py-3">
        {shown.map((l, i) => (
          <li key={`${i}-${l.en.slice(0, 24)}`}>
            <p className="text-sm leading-snug text-fg text-pretty">{l.en}</p>
            {l.zh ? (
              <p className="mt-0.5 text-sm leading-snug text-muted text-pretty">{l.zh}</p>
            ) : (
              <p className="mt-0.5 text-xs text-dim">译…</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotesEditor({ session }: { session: ClassSession }) {
  const patchJot = useCapcom((s) => s.patchJot);
  const removeJot = useCapcom((s) => s.removeJot);
  const setSession = useCapcom((s) => s.setSession);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    setSession(session.id);
    void captureNote(el.value, "hand");
    el.value = "";
  }

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="text-xl font-medium tracking-tight">要点</h2>
      {session.notes.length ? (
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
                aria-label="删这条要点"
                className="size-7 min-h-7 min-w-7"
                onClick={() => removeJot(j.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">教练点「记」，或在下面自己写一条。</p>
      )}
      <form onSubmit={submit} className="border border-line bg-surface p-3">
        <label className="text-xs text-muted" htmlFor="recap-jot">
          写一条要点，中文或英文都可以
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