import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuCheck, MenuItem } from "@/components/ui/menu";
import { sortSessions, useCapcom } from "@/lib/store";
import { forkAndRecap, goHomeSafe, requestRecap } from "@/lib/engine";
import { downloadText, printRecap, recapMarkdown } from "@/lib/export-recap";
import { collectDrillCards } from "@/lib/recap-kit";
import { modeLabel, parseClassMode } from "@/lib/class-mode";
import { sampleById } from "@/lib/samples";
import { formatDayTime } from "@/lib/utils";
import { DrillDeck } from "./recap/drill-deck";
import { HandoutBody } from "./recap/handout-body";
import { RecapCatalog } from "./recap/recap-catalog";
import { SampleLinks } from "./recap/sample-links";
import { tally } from "./recap/tally";

export type RecapMode = "read" | "drill";

/** What the URL says the page should show. */
export type RecapRouteProps = {
  mode: RecapMode;
  /** `/class/:id` or `/review?class=`; `null` on `/class` and on `/review` for every class. */
  sessionId: string | null;
  /** `?catalog` — the drawer is open on a phone. */
  catalog: boolean;
  /** `?edit` — the paper is editable. Read mode only. */
  editing: boolean;
};

/** Everywhere this page can send the student, as URL changes. */
type RecapNav = {
  read: (id: string) => void;
  drill: (classId: string | null) => void;
  catalog: () => void;
  setCatalogOpen: (on: boolean) => void;
  setEditing: (on: boolean) => void;
};

function useRecapNav(route: RecapRouteProps): RecapNav {
  const navigate = useNavigate();
  const { mode, sessionId, catalog, editing } = route;
  return useMemo(() => {
    const here = (patch: { catalog?: boolean; editing?: boolean }) => {
      const open = patch.catalog ?? catalog;
      const edit = patch.editing ?? editing;
      if (mode === "drill") {
        void navigate({
          to: "/review",
          search: { ...(sessionId ? { class: sessionId } : {}), ...(open ? { catalog: true as const } : {}) },
          replace: true,
        });
      } else if (sessionId) {
        void navigate({
          to: "/class/$id",
          params: { id: sessionId },
          search: { ...(open ? { catalog: true as const } : {}), ...(edit ? { edit: true as const } : {}) },
          replace: true,
        });
      }
    };
    return {
      read: (id) => void navigate({ to: "/class/$id", params: { id }, search: {} }),
      drill: (classId) => void navigate({ to: "/review", search: classId ? { class: classId } : {} }),
      catalog: () => void navigate({ to: "/class" }),
      setCatalogOpen: (on) => here({ catalog: on }),
      setEditing: (on) => here({ editing: on }),
    };
  }, [navigate, mode, sessionId, catalog, editing]);
}

/**
 * The handout page: catalog on the left, one paper on the right. Which class,
 * reading or drilling, drawer and edit state all come from the URL; the store
 * only mirrors the picked class so the engine's fallbacks keep pointing at it.
 */
export function RecapPage(route: RecapRouteProps) {
  const { mode, sessionId, catalog, editing } = route;
  const sessions = useCapcom((s) => s.sessions);
  const hydrated = useCapcom((s) => s.hydrated);
  const storeSessionId = useCapcom((s) => s.sessionId);
  const setSession = useCapcom((s) => s.setSession);
  const renameSession = useCapcom((s) => s.renameSession);
  const removeSession = useCapcom((s) => s.removeSession);
  const starSession = useCapcom((s) => s.starSession);
  const updateRecap = useCapcom((s) => s.updateRecap);
  const pending = useCapcom((s) => s.recapPending);
  const recapStage = useCapcom((s) => s.recapStage);
  const error = useCapcom((s) => s.recapError);
  const captions = useCapcom((s) => s.captions);
  const liveId = useCapcom((s) => s.liveId);
  const ping = useCapcom((s) => s.ping);
  const [withTape, setWithTape] = useState(false);
  const [doomed, setDoomed] = useState<string | null>(null);
  const nav = useRecapNav(route);

  const stored = sessionId ? (sessions.find((s) => s.id === sessionId) ?? null) : null;
  // A sample handout is a page of its own: read-only, never in the catalog.
  const sample = useMemo(() => (sessionId && !stored ? sampleById(sessionId) : null), [sessionId, stored]);
  const session = stored ?? sample;
  const readOnly = Boolean(sample);
  const missing = Boolean(sessionId && hydrated && !session);
  const recap = session?.recap ?? null;
  const living = Boolean(session && !session.endedAt);
  const inClass = sessions.some((s) => s.id === liveId && !s.endedAt);
  const isLive = Boolean(stored && stored.id === liveId);
  const canRun = !readOnly && ((session?.transcript?.length ?? 0) >= 2 || (isLive && captions.length >= 2));
  const hasPaper = Boolean(recap?.lede || recap?.sections.length);
  const needWrite = !readOnly && (pending || Boolean(error) || !hasPaper);
  const stats = useMemo(() => tally(sessions), [sessions]);
  const listed = useMemo(() => sortSessions(sessions), [sessions]);
  const deckSessions = useMemo(() => (sample ? [sample] : sessions), [sample, sessions]);
  const thisClassCards = useMemo(() => (session ? collectDrillCards([session], session.id).length : 0), [session]);

  useEffect(() => {
    if (stored && stored.id !== storeSessionId) setSession(stored.id);
  }, [stored, storeSessionId, setSession]);

  // Deleting asks first; the answer lands here.
  function remove(id: string) {
    setDoomed(null);
    removeSession(id);
    if (id !== sessionId) return;
    const next = listed.find((s) => s.id !== id);
    if (mode === "drill") nav.drill(null);
    else if (next) nav.read(next.id);
    else nav.catalog();
  }
  const doomedTitle = doomed ? (sessions.find((s) => s.id === doomed)?.title ?? "") : "";

  function rename(id: string, current: string, raw: string) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name || name === current) return;
    renameSession(id, name);
    ping("标题已改");
  }

  // `/class` with nothing picked: on a phone the catalog takes the screen —
  // unless it is empty, when the paper's first-visit guidance is worth more.
  const bare = !sessionId && mode === "read" && !(hydrated && !sessions.length);
  const homeLabel = inClass ? "回课堂" : "首页";

  return (
    <div className="flex min-h-0 flex-1">
      <RecapCatalog
        listed={listed}
        currentId={session?.id ?? null}
        liveId={liveId}
        inClass={inClass}
        stats={stats}
        open={catalog}
        bare={bare}
        onPick={nav.read}
        onClose={() => nav.setCatalogOpen(false)}
        onStar={starSession}
        onRemove={setDoomed}
        onHome={goHomeSafe}
      />
      {doomed ? (
        <Confirm
          title="删掉这份纪要？"
          body={`「${doomedTitle}」的实录、教练卡和讲义会一起删掉；登录同步过的设备上也会删。`}
          confirmLabel="删除"
          danger
          onConfirm={() => remove(doomed)}
          onCancel={() => setDoomed(null)}
        />
      ) : null}

      <article className={"recap-sheet min-h-0 min-w-0 flex-1 overflow-y-auto " + (bare ? "hidden md:block" : "")}>
        <div className="recap-paper mx-auto flex max-w-[42rem] flex-col gap-12 px-6 py-12 md:px-8 md:py-16">
          {!hydrated && !sample ? (
            // The catalog index is up but the classes themselves are still loading; a blank sheet beats a flash of "nothing here".
            <p className="sr-only">正在读取纪要</p>
          ) : !session ? (
            <EmptyPaper
              mode={mode}
              missing={missing}
              hasClasses={sessions.length > 0}
              catalogOpen={() => nav.setCatalogOpen(true)}
              toCatalog={nav.catalog}
              onSample={nav.read}
            >
              {mode === "drill" ? (
                <DrillDeck
                  key="all"
                  sessions={sessions}
                  classId={null}
                  thisClassId={storeSessionId && sessions.some((s) => s.id === storeSessionId) ? storeSessionId : null}
                  onScope={nav.drill}
                />
              ) : null}
            </EmptyPaper>
          ) : (
            <>
              <header className="flex flex-col gap-4">
                <div className="recap-chrome flex items-center justify-between gap-3">
                  <p className="text-sm text-muted">
                    {readOnly ? "示例讲义" : mode === "drill" ? "复习" : "讲义"}
                    {living ? " · 进行中" : ""}
                    {mode === "read" && recap?.draft ? " · 未完稿" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="quiet" size="xs" className="md:hidden" onClick={() => nav.setCatalogOpen(true)}>
                      目录
                    </Button>
                    <Button type="button" variant="quiet" size="xs" className="md:hidden" onClick={goHomeSafe}>
                      {homeLabel}
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
                  readOnly={readOnly || mode === "drill"}
                  onBlur={(e) => {
                    if (!readOnly) rename(session.id, session.title, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-full resize-none px-3 py-2 text-2xl font-medium tracking-tight text-fg text-balance"
                  aria-label="纪要标题"
                />
                {/* Three groups: this handout, then export, and — apart, on the far side — the one thing that cannot be undone. */}
                <div className="recap-tools flex flex-wrap items-center gap-x-1 gap-y-2">
                  {mode === "drill" ? (
                    <Button type="button" variant="secondary" size="xs" onClick={() => nav.read(session.id)}>
                      看纪要
                    </Button>
                  ) : editing ? (
                    <Button type="button" variant="primary" size="xs" onClick={() => nav.setEditing(false)}>
                      完成
                    </Button>
                  ) : needWrite ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => void requestRecap(session.id)}
                      disabled={pending || !canRun}
                    >
                      {pending ? "在写" : "整理本堂"}
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => nav.drill(session.id)}
                        disabled={!thisClassCards && !stats.cards}
                      >
                        复习
                      </Button>
                      {readOnly ? null : (
                        <>
                          <Button type="button" variant="quiet" size="xs" onClick={() => nav.setEditing(true)} disabled={!recap}>
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="quiet"
                            size="xs"
                            onClick={() => void forkAndRecap(session.id)}
                            disabled={pending || !canRun}
                          >
                            再出一份
                          </Button>
                        </>
                      )}
                      <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
                      <Menu label="导出" size="xs" panelClassName="min-w-44">
                        <MenuItem
                          onSelect={() =>
                            downloadText(`${session.title}.md`, recapMarkdown(session, { tape: withTape }), "text/markdown;charset=utf-8")
                          }
                        >
                          下载 Markdown
                        </MenuItem>
                        <MenuItem onSelect={() => printRecap(session, { tape: withTape })}>打印</MenuItem>
                        <MenuCheck checked={withTape} onChange={setWithTape}>
                          含实录
                        </MenuCheck>
                      </Menu>
                      {readOnly ? null : (
                        <Button
                          type="button"
                          variant="quiet"
                          size="xs"
                          className="ml-auto text-dim hover:text-abort"
                          onClick={() => setDoomed(session.id)}
                        >
                          删除
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </header>

              {mode === "drill" ? (
                <DrillDeck
                  key={session.id}
                  sessions={deckSessions}
                  classId={session.id}
                  thisClassId={session.id}
                  onScope={nav.drill}
                />
              ) : (
                <HandoutBody
                  session={session}
                  editing={editing && !readOnly}
                  readOnly={readOnly}
                  pending={!readOnly && pending}
                  stage={recapStage}
                  error={readOnly ? null : error}
                  liveLines={isLive && living ? captions.map((c) => ({ en: c.en, zh: c.zh })) : null}
                  onPatch={(patch) => updateRecap(session.id, patch)}
                />
              )}
              {readOnly ? (
                <p className="recap-chrome border-t border-line pt-6 text-sm text-muted">
                  这是一份示例，不在你的目录里。上一堂课，结课后就会有一份这样的讲义。
                </p>
              ) : null}
            </>
          )}
        </div>
      </article>
    </div>
  );
}

/** The paper with no class on it: `/class`, `/review` for every class, or a link to a class this device does not have. */
function EmptyPaper({
  mode,
  missing,
  hasClasses,
  catalogOpen,
  toCatalog,
  onSample,
  children,
}: {
  mode: RecapMode;
  missing: boolean;
  hasClasses: boolean;
  catalogOpen: () => void;
  toCatalog: () => void;
  onSample: (id: string) => void;
  children?: ReactNode;
}) {
  if (missing) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-muted">这台设备上没有这堂课的纪要。登录同步过的设备上才有，或者它已经被删掉。</p>
        <div className="flex gap-2">
          <Button type="button" variant="quiet" size="lg" onClick={toCatalog}>
            看目录
          </Button>
          <Button type="button" variant="quiet" size="lg" onClick={goHomeSafe}>
            首页
          </Button>
        </div>
      </div>
    );
  }
  if (mode === "drill") {
    return (
      <>
        <header className="flex flex-col gap-4">
          <div className="recap-chrome flex items-center justify-between gap-3">
            <p className="text-sm text-muted">复习 · 全部堂次</p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="quiet" size="xs" className="md:hidden" onClick={catalogOpen}>
                目录
              </Button>
              <Button type="button" variant="quiet" size="xs" className="md:hidden" onClick={goHomeSafe}>
                首页
              </Button>
            </div>
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-fg">跨课词条</h1>
        </header>
        {children}
      </>
    );
  }
  if (hasClasses) return <p className="text-base text-muted">从左边的目录里挑一堂。</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base text-fg">还没有上过课。</p>
        <p className="text-sm text-muted">
          回到首页点「开始听」，结课后这里会出现那一堂的讲义：本堂内容、语言点、附录。
        </p>
      </div>
      <SampleLinks onPick={onSample} />
    </div>
  );
}