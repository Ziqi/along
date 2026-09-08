import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Trash2, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sortSessions, useCapcom } from "@/lib/store";
import { requestRecap, forkAndRecap, captureNote, goHomeSafe } from "@/components/capcom/use-engine";
import { downloadText, printRecap, recapMarkdown } from "@/lib/export-recap";
import { collectDrillCards, splitProse } from "@/lib/recap-kit";
import { recapStageView, type RecapStage } from "@/lib/recap-stage";
import type { ClassSession, RecapCoach, RecapPair, RecapStudy, RecapTable } from "@/lib/types";
import { isStudyAppendix, isStudyCard, modeLabel, parseClassMode, recapAppendixCopy } from "@/lib/class-mode";
import { formatDayTime } from "@/lib/utils";
import { SignedOut } from "@/lib/auth/gates";

export function RecapPage() {
  const sessions = useCapcom((s) => s.sessions);
  const sessionId = useCapcom((s) => s.sessionId);
  const setSession = useCapcom((s) => s.setSession);
  const setView = useCapcom((s) => s.setView);
  const renameSession = useCapcom((s) => s.renameSession);
  const removeSession = useCapcom((s) => s.removeSession);
  const starSession = useCapcom((s) => s.starSession);
  const pending = useCapcom((s) => s.recapPending);
  const recapStage = useCapcom((s) => s.recapStage);
  const error = useCapcom((s) => s.recapError);
  const captions = useCapcom((s) => s.captions);
  const liveId = useCapcom((s) => s.liveId);
  const [mode, setMode] = useState<"read" | "drill">("read");
  const [withTape, setWithTape] = useState(false);
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const updateRecap = useCapcom((s) => s.updateRecap);
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  const recap = session?.recap ?? null;
  const sections = recap?.sections ?? [];
  const patterns = recap?.patterns ?? [];
  const lines = recap?.lines ?? [];
  const words = recap?.words ?? [];
  const collos = recap?.collos ?? [];
  const grammar = recap?.grammar ?? [];
  const skills = recap?.skills ?? [];
  const topics = recap?.topics ?? [];
  const outline = recap?.outline ?? [];
  const takeaways = recap?.takeaways ?? [];
  const coachPack = recap?.coachPack ?? [];
  const appendix = recapAppendixCopy(isStudyAppendix(session?.classMode, coachPack));
  const living = Boolean(session && !session.endedAt);
  const inClass = sessions.some((s) => s.id === liveId && !s.endedAt);
  const canRun = (session?.transcript?.length ?? 0) >= 2 || captions.length >= 2;
  const hasPaper = Boolean(recap?.lede || sections.length);
  const needWrite = pending || Boolean(error) || !hasPaper;
  const stats = useMemo(() => tally(sessions), [sessions]);
  const thisClassCards = useMemo(
    () => collectDrillCards(session ? [session] : [], session?.id),
    [session],
  );
  const listed = useMemo(() => sortSessions(sessions), [sessions]);
  const marks = useMemo(() => {
    const fromAi = recap?.marks ?? [];
    if (fromAi.length) {
      return [...new Set(fromAi.filter((t) => t && t.length >= 3 && t.split(/\s+/).length <= 4))].sort(
        (a, b) => b.length - a.length,
      );
    }
    const raw = [...words, ...collos].map((x) => x.en);
    return [...new Set(raw.filter((t) => t && t.length >= 4 && t.split(/\s+/).length <= 4))].sort(
      (a, b) => b.length - a.length,
    ).slice(0, 24);
  }, [recap?.marks, words, collos]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") goHomeSafe();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  return (
    <div className="flex min-h-0 flex-1">
      {catalog ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-fg/20 md:hidden"
          aria-label="关闭目录"
          onClick={() => setCatalog(false)}
        />
      ) : null}
      <aside
        className={
          "recap-catalog flex w-[min(18rem,86vw)] shrink-0 flex-col border-r border-line bg-bg " +
          (catalog ? "fixed inset-y-0 left-0 z-30" : "hidden md:flex")
        }
      >
        <div className="flex h-10 items-center justify-between border-b border-line px-3">
          <p className="text-sm font-medium text-fg">纪要</p>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-7 min-h-7 px-2"
            onClick={() => goHomeSafe()}
          >
            {inClass ? "回课堂" : "首页"}
          </Button>
        </div>
        <div className="border-b border-line px-3 py-3">
          <p className="text-sm leading-relaxed text-muted">
            {stats.classes} 堂 · {stats.topics} 主题 · {stats.patterns} 句式 · {stats.words} 词
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-1">
          {sessions.length ? (
            <ul>
              {listed.map((s) => (
                <li key={s.id} className="border-b border-line/60">
                  <div
                    className={
                      "flex items-start gap-1 px-2 py-2.5 " +
                      (s.id === session?.id ? "bg-elevated" : "hover:bg-surface")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSession(s.id);
                        setMode("read");
                        setCatalog(false);
                      }}
                      className="min-w-0 flex-1 px-1 py-0.5 text-left"
                    >
                      <span className="block text-xs text-dim">
                        {formatDayTime(s.startedAt)}
                        {" · "}
                        {modeLabel(parseClassMode(s.classMode))}
                        {s.id === liveId && !s.endedAt ? " · 进行中" : ""}
                      </span>
                      <span className="mt-1 block truncate text-base font-medium leading-snug text-fg">
                        {s.title}
                      </span>
                      {s.sourceTitle ? (
                        <span className="mt-0.5 block truncate text-xs text-dim">
                          由 {s.sourceTitle} 再出
                        </span>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon"
                      aria-label={s.starred ? "取消置顶" : "置顶"}
                      className="size-7 min-h-7 min-w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        starSession(s.id);
                      }}
                    >
                      <Pin
                        className={
                          "size-3.5 " + (s.starred ? "fill-fg text-fg" : "text-dim")
                        }
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon"
                      aria-label="删这份纪要"
                      className="size-7 min-h-7 min-w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(s.id);
                      }}
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
        <SignedOut>
          <p className="recap-chrome border-t border-line px-3 py-3 text-xs leading-relaxed text-muted">
            这台设备上的纪要只存在本机。
            <a href="/login" className="ml-1 text-fg underline decoration-fg/30 underline-offset-4">
              登录后同步
            </a>
          </p>
        </SignedOut>
      </aside>

      <article className="recap-sheet min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="recap-paper mx-auto flex max-w-[42rem] flex-col gap-12 px-6 py-12 md:px-8 md:py-16">
          {!session ? (
            <p className="text-base text-muted">结课之后，左边课表会列出各堂。</p>
          ) : (
            <>
              <header className="flex flex-col gap-4">
                <div className="recap-chrome flex items-center justify-between gap-3">
                  <p className="text-sm text-muted">
                    讲义
                    {living ? " · 进行中" : ""}
                    {recap?.draft ? " · 未完稿" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="h-7 min-h-7 px-2 md:hidden"
                      onClick={() => setCatalog(true)}
                    >
                      目录
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="h-7 min-h-7 px-2 md:hidden"
                      onClick={() => goHomeSafe()}
                    >
                      {inClass ? "回课堂" : "首页"}
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted">
                  {formatDayTime(session.startedAt)}
                  {" · "}
                  {modeLabel(parseClassMode(session.classMode))}
                  {session.sourceTitle ? ` · ${session.sourceTitle}` : ""}
                </p>
                <textarea
                  key={`${session.id}-${session.title}`}
                  defaultValue={session.title}
                  rows={2}
                  onBlur={(e) => renameSession(session.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-full resize-none px-3 py-2 text-[2rem] font-medium leading-tight tracking-tight text-fg text-balance"
                  aria-label="纪要标题"
                />
                <div className="recap-tools flex flex-wrap items-center gap-2">
                  {mode === "drill" ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="h-7 min-h-7 px-2"
                      onClick={() => setMode("read")}
                    >
                      看纪要
                    </Button>
                  ) : editing ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="h-7 min-h-7 px-2"
                      onClick={() => setEditing(false)}
                    >
                      完成
                    </Button>
                  ) : needWrite ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="h-7 min-h-7 px-2"
                      onClick={() => void requestRecap(session.id)}
                      disabled={pending || !canRun}
                    >
                      {pending ? "在写" : "整理本堂"}
                    </Button>
                  ) : (
                    <>
                      <details className="recap-menu relative" onToggle={closeOtherMenus}>
                        <summary className="cursor-pointer px-2 py-1 text-sm text-muted hover:text-fg">
                          整理
                        </summary>
                        <div className="absolute left-0 top-full z-20 mt-1 flex min-w-40 flex-col border border-line bg-elevated p-1">
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            className="h-8 justify-start px-2"
                            onClick={() => void forkAndRecap(session.id)}
                            disabled={pending || !canRun}
                          >
                            再出一份
                          </Button>
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            className="h-8 justify-start px-2"
                            onClick={() => setEditing(true)}
                            disabled={!recap}
                          >
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            className="h-8 justify-start px-2"
                            onClick={() => removeSession(session.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </details>
                      <details className="recap-menu relative" onToggle={closeOtherMenus}>
                        <summary className="cursor-pointer px-2 py-1 text-sm text-muted hover:text-fg">
                          导出
                        </summary>
                        <div className="absolute left-0 top-full z-20 mt-1 flex min-w-44 flex-col border border-line bg-elevated p-1">
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            className="h-8 justify-start px-2"
                            onClick={() =>
                              downloadText(
                                `${session.title}.md`,
                                recapMarkdown(session, { tape: withTape }),
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
                            className="h-8 justify-start px-2"
                            onClick={() => printRecap(session, { tape: withTape })}
                          >
                            打印
                          </Button>
                          <label className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={withTape}
                              onChange={(e) => setWithTape(e.target.checked)}
                            />
                            含实录
                          </label>
                        </div>
                      </details>
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        className="h-7 min-h-7 px-2"
                        onClick={() => setMode("drill")}
                        disabled={!thisClassCards.length && !stats.cards}
                      >
                        复习
                      </Button>
                    </>
                  )}
                </div>
              </header>

              {mode === "drill" ? (
                <DrillDeck sessions={sessions} currentId={session.id} />
              ) : (
                <>
                  {error ? (
                    <p className="border border-line bg-elevated px-4 py-3 text-sm text-abort">
                      {error} 点上面「整理本堂」。
                    </p>
                  ) : null}
                  {pending ? <RecapProgress stage={recapStage} /> : null}
                  {!pending && recap?.draft && !recap.lede && !sections.length ? (
                    <p className="text-base leading-relaxed text-muted">
                      目录不是讲义。正文失败会自动再写。不要停在这一页当完成稿。
                    </p>
                  ) : null}

                  {recap?.lede || sections.length || takeaways.length ? (
                    <p className="text-sm text-muted">本堂内容</p>
                  ) : null}

                  {recap?.lede || editing ? (
                    <section className="flex flex-col gap-2">
                      {editing ? (
                        <>
                          <EditText
                            value={recap?.lede ?? ""}
                            rows={4}
                            className="text-lg leading-8 text-fg"
                            onSave={(lede) => updateRecap(session.id, { lede })}
                          />
                          <EditText
                            value={recap?.ledeZh ?? ""}
                            rows={3}
                            className="text-sm leading-relaxed text-muted"
                            onSave={(ledeZh) => updateRecap(session.id, { ledeZh })}
                          />
                        </>
                      ) : recap?.lede ? (
                        <>
                          <p className="text-lg leading-8 text-fg text-pretty">
                            <MarkText text={recap.lede} terms={marks} />
                          </p>
                          {recap.ledeZh ? (
                            <p className="text-sm leading-relaxed text-muted text-pretty">
                              {recap.ledeZh}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </section>
                  ) : null}

                  {takeaways.length ? (
                    <section className="flex flex-col gap-2">
                      <h2 className="text-xl font-medium tracking-tight">要点</h2>
                      <ol className="list-decimal space-y-2 pl-5">
                        {takeaways.map((t) => (
                          <li key={t.en} className="pl-1">
                            <p className="text-base leading-relaxed text-fg">
                              <MarkText text={t.en} terms={marks} />
                            </p>
                            {t.zh ? (
                              <p className="text-sm leading-relaxed text-muted">{t.zh}</p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}

                  {sections.map((sec, i) => (
                    <section key={`${sec.heading}-${i}`} className="flex flex-col gap-2">
                      {editing ? (
                        <>
                          <EditText
                            value={sec.heading}
                            rows={1}
                            className="text-xl font-medium tracking-tight"
                            onSave={(heading) => {
                              const next = sections.map((s, n) =>
                                n === i ? { ...s, heading } : s,
                              );
                              updateRecap(session.id, { sections: next });
                            }}
                          />
                          <EditText
                            value={sec.headingZh}
                            rows={1}
                            className="text-sm text-muted"
                            onSave={(headingZh) => {
                              const next = sections.map((s, n) =>
                                n === i ? { ...s, headingZh } : s,
                              );
                              updateRecap(session.id, { sections: next });
                            }}
                          />
                          <EditText
                            value={sec.body}
                            rows={Math.min(10, Math.max(4, sec.body.split("\n").length + 1))}
                            className="text-base leading-8 text-fg"
                            onSave={(body) => {
                              const next = sections.map((s, n) =>
                                n === i ? { ...s, body } : s,
                              );
                              updateRecap(session.id, { sections: next });
                            }}
                          />
                          <EditText
                            value={sec.bodyZh}
                            rows={4}
                            className="text-sm leading-relaxed text-muted"
                            onSave={(bodyZh) => {
                              const next = sections.map((s, n) =>
                                n === i ? { ...s, bodyZh } : s,
                              );
                              updateRecap(session.id, { sections: next });
                            }}
                          />
                          {sec.table ? <ContrastTable table={sec.table} /> : null}
                        </>
                      ) : (
                        <>
                          <h2 className="text-xl font-medium tracking-tight text-balance">
                            {i + 1}. {sec.heading}
                          </h2>
                          {sec.headingZh ? (
                            <p className="text-sm text-muted">{sec.headingZh}</p>
                          ) : null}
                          <ProseBlocks text={sec.body} terms={marks} />
                          {sec.table ? <ContrastTable table={sec.table} /> : null}
                          {sec.bodyZh ? <ProseBlocks text={sec.bodyZh} muted /> : null}
                        </>
                      )}
                    </section>
                  ))}

                  {outline.length && !sections.length ? (
                    <p className="text-base leading-relaxed text-muted">
                      只有目录，还没有讲义正文。点上面「整理本堂」再写一遍。
                    </p>
                  ) : living && !recap && !pending ? (
                    <p className="text-base leading-relaxed text-muted">
                      听进几句之后，提纲会落在这里。现在也可以先补一条随手记。
                    </p>
                  ) : null}

                  {topics.length && !sections.length ? <PairList kicker="主题" items={topics} /> : null}

                  {words.length ||
                  collos.length ||
                  patterns.length ||
                  grammar.length ||
                  lines.length ||
                  skills.length ? (
                    <section className="flex flex-col gap-8 border-t border-line pt-8">
                      <div>
                        <p className="text-sm text-muted">语言点</p>
                        <h2 className="mt-2 text-xl font-medium tracking-tight">语言点</h2>
                        <p className="mt-1 text-sm text-muted">
                          从这一堂里抽出的词、搭配、句式。每条都能指回刚听过的说法，并带用法和例句。
                        </p>
                      </div>
                      <StudyCards
                        kicker="单词"
                        items={words}
                        editing={editing}
                        onChange={(next) => updateRecap(session.id, { words: next })}
                      />
                      <StudyCards
                        kicker="搭配"
                        items={collos}
                        editing={editing}
                        onChange={(next) => updateRecap(session.id, { collos: next })}
                      />
                      <StudyCards
                        kicker="句式"
                        items={patterns}
                        editing={editing}
                        onChange={(next) => updateRecap(session.id, { patterns: next })}
                      />
                      <StudyCards
                        kicker="语法"
                        items={grammar}
                        editing={editing}
                        onChange={(next) => updateRecap(session.id, { grammar: next })}
                      />
                      <StudyCards
                        kicker="好例句"
                        items={lines}
                        editing={editing}
                        onChange={(next) => updateRecap(session.id, { lines: next })}
                      />
                      {skills.length ? (
                        <div className="flex flex-col gap-2">
                          <h3 className="text-lg font-medium tracking-tight">{appendix.skills}</h3>
                          <ol className="list-decimal space-y-2 pl-5">
                            {skills.map((t) => (
                              <li key={t.en} className="pl-1">
                                <p className="text-base leading-relaxed text-fg">
                                  <MarkText text={t.en} terms={marks} />
                                </p>
                                {t.zh ? (
                                  <p className="text-sm leading-relaxed text-muted">{t.zh}</p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {coachPack.length ? (
                    <section className="flex flex-col gap-8 border-t border-line pt-8">
                      <div>
                        <p className="text-sm text-muted">
                          {appendix.part}
                        </p>
                        <h2 className="mt-2 text-xl font-medium tracking-tight">
                          {appendix.heading}
                        </h2>
                        <p className="mt-1 text-sm text-muted">{appendix.blurb}</p>
                      </div>
                      {coachPack.map((card, i) => (
                        <CoachPackCard key={`${card.topic}-${i}`} card={card} terms={marks} />
                      ))}
                    </section>
                  ) : null}

                  <NotesEditor session={session} />

                  <LiveTape
                    lines={
                      living && captions.length
                        ? captions.map((c) => ({ en: c.en, zh: c.zh }))
                        : session.transcript
                    }
                  />
                </>
              )}
            </>
          )}
        </div>
      </article>
    </div>
  );
}

function closeOtherMenus(e: { currentTarget: HTMLDetailsElement }) {
  if (!e.currentTarget.open) return;
  document.querySelectorAll<HTMLDetailsElement>(".recap-menu").forEach((el) => {
    if (el !== e.currentTarget) el.open = false;
  });
}

function EditText({
  value,
  onSave,
  rows,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  rows: number;
  className?: string;
}) {
  return (
    <textarea
      defaultValue={value}
      key={value.slice(0, 48)}
      rows={rows}
      onBlur={(e) => onSave(e.target.value)}
      className={
        "w-full resize-none border border-line bg-elevated px-2 py-1.5 focus:outline-none " +
        (className ?? "")
      }
    />
  );
}

function CoachPackCard({
  card,
  terms,
}: {
  card: RecapCoach;
  terms?: string[];
}) {
  return (
    <article className="flex flex-col gap-3 border border-line bg-elevated px-4 py-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          {isStudyCard(card) ? "剖析" : card.move === "answer" ? "回答" : "开口"}
        </p>
        <h3 className="text-lg font-medium tracking-tight">{card.topic}</h3>
        {card.topicZh ? <p className="text-sm text-muted">{card.topicZh}</p> : null}
      </header>
      {card.briefEn ? (
        <p className="text-base leading-relaxed text-fg text-pretty">
          <MarkText text={card.briefEn} terms={terms} />
        </p>
      ) : null}
      {card.briefZh ? <p className="text-sm leading-relaxed text-muted">{card.briefZh}</p> : null}
      {card.options.length ? (
        <ol className="list-decimal space-y-2 pl-5">
          {card.options.map((o) => (
            <li key={o.en} className="pl-1">
              <p className="text-sm text-dim">{o.label}</p>
              <p className="text-base leading-relaxed">
                <MarkText text={o.en} terms={terms} />
              </p>
              {o.zh ? <p className="text-sm text-muted">{o.zh}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {card.extras.length ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm text-dim">延展</p>
          {card.extras.map((o) => (
            <div key={o.en}>
              <p className="text-base leading-relaxed">
                <MarkText text={o.en} terms={terms} />
              </p>
              {o.zh ? <p className="text-sm text-muted">{o.zh}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {card.deep ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted">DeepSearch</p>
          <h4 className="text-base font-medium">{card.deep.title}</h4>
          {card.deep.viewEn ? (
            <p className="text-base leading-relaxed text-pretty">
              <MarkText text={card.deep.viewEn} terms={terms} />
            </p>
          ) : null}
          {card.deep.viewZh ? <p className="text-sm leading-relaxed text-muted">{card.deep.viewZh}</p> : null}
          {card.deep.facts.length ? (
            <ol className="list-decimal space-y-1 pl-5">
              {card.deep.facts.map((f) => (
                <li key={f.en} className="text-sm leading-relaxed">
                  {f.en}
                  {f.zh ? <span className="block text-muted">{f.zh}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {card.deep.aEn ? (
            <p className="text-base leading-relaxed text-pretty">
              <MarkText text={card.deep.aEn} terms={terms} />
            </p>
          ) : null}
          {card.deep.aZh ? <p className="text-sm leading-relaxed text-muted">{card.deep.aZh}</p> : null}
          {card.deep.terms.length ? (
            <ul className="flex flex-col gap-1">
              {card.deep.terms.map((t) => (
                <li key={t.en} className="text-sm">
                  <span className="font-medium">{t.en}</span>
                  {t.zh ? <span className="text-muted"> · {t.zh}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MarkText({ text, terms }: { text: string; terms?: string[] }) {
  const chunks = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2) {
          return (
            <mark
              key={i}
              className="bg-transparent font-medium underline decoration-fg/40 underline-offset-4"
            >
              {chunk.slice(1, -1)}
            </mark>
          );
        }
        return <HighlightTerms key={i} text={chunk} terms={terms} />;
      })}
    </>
  );
}

function StarEn({ text }: { text: string }) {
  return <MarkText text={text} />;
}

function HighlightTerms({ text, terms }: { text: string; terms?: string[] }) {
  const keys = (terms ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 40);
  if (!keys.length || !text) return <>{text}</>;
  const escaped = [...keys]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let re: RegExp;
  try {
    re = new RegExp(`(${escaped.join("|")})`, "gi");
  } catch {
    return <>{text}</>;
  }
  const parts = text.split(re);
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  return (
    <>
      {parts.map((p, i) =>
        lower.has(p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-hold/25 px-0.5 font-medium text-fg">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function RecapProgress({ stage }: { stage: RecapStage | null }) {
  const view = recapStageView(stage);
  const pct = (view.step / view.of) * 100;
  return (
    <div className="flex flex-col gap-2 border border-line bg-elevated px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-fg">{view.label}</p>
        <p className="font-mono text-xs tabular-nums text-dim">
          {view.step} / {view.of}
        </p>
      </div>
      <div className="h-1.5 w-full bg-line">
        <div className="h-1.5 bg-fg transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">
        {stage === "study"
          ? "正文已经铺在下面。语言点写完会接在后面。"
          : "先写导语和章节。写出来会先落在这张纸上，再填词表。"}
      </p>
    </div>
  );
}

function ProseBlocks({
  text,
  muted,
  terms,
}: {
  text: string;
  muted?: boolean;
  terms?: string[];
}) {
  const blocks = splitProse(text);
  if (!blocks.length) return null;
  const body = muted ? "text-sm leading-relaxed text-muted text-pretty" : "text-base leading-8 text-fg text-pretty";
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, bi) =>
        b.type === "ol" ? (
          <ol key={bi} className="list-decimal space-y-2 pl-5">
            {b.items.map((l, li) => (
              <li key={li} className={body}>
                <MarkText text={l} terms={muted ? undefined : terms} />
              </li>
            ))}
          </ol>
        ) : b.type === "ul" ? (
          <ul key={bi} className="list-disc space-y-1 pl-5">
            {b.items.map((l, li) => (
              <li key={li} className={body}>
                <MarkText text={l} terms={muted ? undefined : terms} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={bi} className={body}>
            <MarkText text={b.items[0] ?? ""} terms={muted ? undefined : terms} />
          </p>
        ),
      )}
    </div>
  );
}

function ContrastTable({ table }: { table: RecapTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] border-collapse text-left">
        <caption className="sr-only">
          {table.leftHead} vs {table.rightHead}
        </caption>
        <thead>
          <tr className="border-b border-line align-bottom">
            <th className="py-2 pr-4 font-medium text-fg">
              <span className="block text-sm">{table.leftHead}</span>
              {table.leftHeadZh ? (
                <span className="mt-0.5 block text-xs font-normal text-muted">{table.leftHeadZh}</span>
              ) : null}
            </th>
            <th className="py-2 font-medium text-fg">
              <span className="block text-sm">{table.rightHead}</span>
              {table.rightHeadZh ? (
                <span className="mt-0.5 block text-xs font-normal text-muted">{table.rightHeadZh}</span>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={`${row.left}-${i}`} className="border-b border-line/70 align-top">
              <td className="py-2.5 pr-4">
                <p className="text-sm leading-snug text-fg">{row.left}</p>
                {row.leftZh ? <p className="mt-0.5 text-xs leading-snug text-muted">{row.leftZh}</p> : null}
              </td>
              <td className="py-2.5">
                <p className="text-sm leading-snug text-fg">{row.right}</p>
                {row.rightZh ? <p className="mt-0.5 text-xs leading-snug text-muted">{row.rightZh}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairList({ kicker, items }: { kicker: string; items: RecapPair[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium tracking-tight">{kicker}</h2>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th className="py-2 pr-3 font-normal">英文</th>
            <th className="py-2 font-normal">中文</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.en} className="border-b border-line/70 align-top">
              <td className="py-2.5 pr-3 text-sm font-medium leading-snug text-fg">{it.en}</td>
              <td className="py-2.5 text-sm leading-snug text-muted">{it.zh}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StudyCards({
  kicker,
  items,
  editing,
  onChange,
}: {
  kicker: string;
  items: RecapStudy[];
  editing?: boolean;
  onChange?: (next: RecapStudy[]) => void;
}) {
  if (!items.length && !editing) return null;
  function patch(i: number, field: keyof RecapStudy, value: string) {
    if (!onChange) return;
    onChange(items.map((it, n) => (n === i ? { ...it, [field]: value } : it)));
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-medium tracking-tight">{kicker}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <article
            key={`${it.en}-${i}`}
            className="flex flex-col gap-2 border border-line bg-elevated px-4 py-3"
          >
            {editing ? (
              <>
                <EditText
                  value={it.en}
                  rows={2}
                  className="text-base font-medium"
                  onSave={(v) => patch(i, "en", v)}
                />
                <EditText
                  value={it.zh}
                  rows={2}
                  className="text-sm text-muted"
                  onSave={(v) => patch(i, "zh", v)}
                />
                <p className="text-xs text-dim">用法</p>
                <EditText value={it.use} rows={2} className="text-sm" onSave={(v) => patch(i, "use", v)} />
                <EditText
                  value={it.useZh}
                  rows={2}
                  className="text-sm text-muted"
                  onSave={(v) => patch(i, "useZh", v)}
                />
                <p className="text-xs text-dim">例句</p>
                <EditText
                  value={it.example}
                  rows={2}
                  className="text-sm"
                  onSave={(v) => patch(i, "example", v)}
                />
                <EditText
                  value={it.exampleZh}
                  rows={2}
                  className="text-sm text-muted"
                  onSave={(v) => patch(i, "exampleZh", v)}
                />
              </>
            ) : (
              <>
                <p className="text-base font-medium leading-snug text-fg">{it.en}</p>
                {it.zh ? <p className="text-sm leading-snug text-muted">{it.zh}</p> : null}
                {it.use || it.useZh ? (
                  <div>
                    <p className="text-xs text-dim">用法</p>
                    {it.use ? <p className="mt-1 text-sm leading-relaxed text-fg">{it.use}</p> : null}
                    {it.useZh ? <p className="text-sm leading-relaxed text-muted">{it.useZh}</p> : null}
                  </div>
                ) : null}
                {it.example || it.exampleZh ? (
                  <div>
                    <p className="text-xs text-dim">例句</p>
                    {it.example ? (
                      <p className="mt-1 text-sm leading-relaxed text-fg text-pretty">
                        <StarEn text={it.example} />
                      </p>
                    ) : null}
                    {it.exampleZh ? (
                      <p className="text-sm leading-relaxed text-muted text-pretty">{it.exampleZh}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveTape({ lines }: { lines: { en: string; zh: string }[] }) {
  const shown = lines.filter((l) => l.en);
  if (!shown.length) return null;
  return (
    <details className="border-t border-line pt-8">
      <summary className="cursor-pointer text-xl font-medium tracking-tight">
        课堂实录
      </summary>
      <p className="mt-2 text-sm text-muted">下载时可勾选带上。英文在前。</p>
      <ul className="mt-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
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
    </details>
  );
}

function NotesEditor({ session }: { session: ClassSession }) {
  const patchJot = useCapcom((s) => s.patchJot);
  const removeJot = useCapcom((s) => s.removeJot);
  const setSession = useCapcom((s) => s.setSession);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [notesOpen, setNotesOpen] = useState(true);

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    setSession(session.id);
    void captureNote(el.value, "hand");
    el.value = "";
  }

  return (
    <details
      className="recap-notes border-t border-line pt-8"
      open={notesOpen}
      onToggle={(e) => setNotesOpen(e.currentTarget.open)}
    >
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
                <p className="text-xs text-dim">{formatDayTime(j.at)}</p>
                <textarea
                  key={`${j.id}-en-${j.en}`}
                  defaultValue={j.en}
                  rows={2}
                  onBlur={(e) => patchJot(j.id, { en: e.target.value, pending: false })}
                  className="mt-1 w-full resize-none px-2 py-1.5 text-base leading-snug text-fg"
                  placeholder="英文"
                />
                <textarea
                  key={`${j.id}-zh-${j.zh}`}
                  defaultValue={j.zh}
                  rows={2}
                  onBlur={(e) => patchJot(j.id, { zh: e.target.value, pending: false })}
                  className="mt-1 w-full resize-none px-2 py-1.5 text-sm leading-relaxed text-muted"
                  placeholder="中文"
                />
              </div>
              <Button
                type="button"
                variant="quiet"
                size="icon"
                aria-label="删这条随手记"
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
      <form onSubmit={submit} className="recap-chrome border border-line bg-surface p-3">
        <label className="text-xs text-muted" htmlFor="recap-jot">
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
    for (const t of s.recap?.collos ?? []) if (t.en) cards += 1;
    for (const t of s.recap?.grammar ?? []) if (t.en) cards += 1;
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
  const here = collectDrillCards(sessions, currentId);
  const deck = all ? collectDrillCards(sessions) : here;
  const card = deck[i];
  const back = card
    ? [card.zh, card.useZh || card.use, card.example].filter((x) => x && x.trim())
    : [];

  useEffect(() => {
    setI(0);
    setShow(false);
  }, [all, currentId]);

  function next() {
    setShow(false);
    setI((n) => (deck.length ? (n + 1) % deck.length : 0));
  }

  if (!deck.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="arm" size="sm" className="h-7 min-h-7 px-2" onClick={() => setAll(false)}>
            本堂
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="h-7 min-h-7 px-2"
            onClick={() => setAll(true)}
            disabled={!collectDrillCards(sessions).length}
          >
            全部堂次
          </Button>
        </div>
        <p className="text-base text-muted">
          这堂还没有可翻的词条。语言点写完会先抽这一堂，不是跨课词表。
        </p>
      </div>
    );
  }
  if (!card) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={all ? "quiet" : "arm"}
          size="sm"
          className="h-7 min-h-7 px-2"
          onClick={() => setAll(false)}
        >
          本堂
        </Button>
        <Button
          type="button"
          variant={all ? "arm" : "quiet"}
          size="sm"
          className="h-7 min-h-7 px-2"
          onClick={() => setAll(true)}
        >
          全部堂次
        </Button>
        <p className="text-xs text-dim">
          {all ? "跨课" : "这一堂"} · {i + 1} / {deck.length} · {card.kind}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShow(true)}
        className="min-h-40 border border-line px-5 py-8 text-left"
      >
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
