import { useEffect, useState } from "react";
import { Mic, Moon, MoreHorizontal, Pause, PenLine, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/capcom/mark";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { useCapcom } from "@/lib/store";
import { endClass, openRecap, goHomeSafe } from "@/components/capcom/use-engine";
import { CLASS_MODES, modeLabel, parseClassMode, type ClassMode } from "@/lib/class-mode";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type Props = {
  onArm: (mode?: ClassMode) => void;
  onSafe: () => void;
};

export function MissionBar({ onArm, onSafe }: Props) {
  const mic = useCapcom((s) => s.mic);
  const listening = useCapcom((s) => s.listening);
  const lastLatency = useCapcom((s) => s.lastLatency);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const view = useCapcom((s) => s.view);
  const goHome = goHomeSafe;
  const setJotOpen = useCapcom((s) => s.setJotOpen);
  const live = listening || mic === "live";
  const arming = listening && mic === "arming";
  const openClass = sessions.some((s) => s.id === liveId && !s.endedAt);
  const paused = !live && !arming && openClass;
  const atHome = view === "live" && !openClass;
  const reading = view === "recap";
  const showRecap = sessions.length > 0 || openClass;
  const classMode = useCapcom((s) => s.classMode);
  const setClassMode = useCapcom((s) => s.setClassMode);
  const [theme, setTheme] = useState<Theme>("day");
  const [more, setMore] = useState(false);
  const [pick, setPick] = useState(false);
  const [switchMode, setSwitchMode] = useState(false);
  const { isPending } = useCurrentUserState();
  const liveMode = parseClassMode(
    sessions.find((s) => s.id === liveId && !s.endedAt)?.classMode ?? classMode,
  );

  useEffect(() => {
    const next = readTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night";
    setTheme(next);
    applyTheme(next);
  }

  const listenBtn = live ? (
    <Button type="button" variant="safe" size="lg" className="max-md:h-10 max-md:min-h-10 max-md:px-3" onClick={onSafe}>
      <Pause className="size-3.5" />
      暂停
    </Button>
  ) : (
    <Button
      type="button"
      variant="arm"
      size="lg"
      className="max-md:h-10 max-md:min-h-10 max-md:px-3"
      onClick={() => {
        if (paused || openClass) onArm();
        else setPick(true);
      }}
      disabled={arming}
    >
      <Mic className="size-4" />
      {arming ? "开麦中" : paused ? "继续听" : "开始听"}
    </Button>
  );

  const extras = (
    <>
      {openClass && !reading ? (
        <Button
          type="button"
          variant="quiet"
          size="lg"
          className="max-md:w-full max-md:justify-start"
          onClick={() => {
            setSwitchMode(true);
            setMore(false);
          }}
        >
          {modeLabel(liveMode)}
        </Button>
      ) : null}
      {openClass && !reading ? (
        <Button type="button" variant="quiet" size="lg" className="max-md:w-full max-md:justify-start" onClick={() => { setJotOpen(true); setMore(false); }}>
          <PenLine className="size-3.5" />
          记
        </Button>
      ) : null}
      {reading ? (
        <Button type="button" variant="quiet" size="lg" className="max-md:w-full max-md:justify-start" onClick={() => { goHome(); setMore(false); }}>
          {openClass ? "回课堂" : "首页"}
        </Button>
      ) : null}
      {showRecap && !reading ? (
        <Button
          type="button"
          variant="quiet"
          size="lg"
          className="max-md:w-full max-md:justify-start"
          onClick={() => {
            openRecap();
            setMore(false);
          }}
        >
          纪要
        </Button>
      ) : null}
      {openClass && !reading ? (
        <Button type="button" variant="end" size="lg" className="max-md:w-full" onClick={() => { void endClass(); setMore(false); }}>
          结课
        </Button>
      ) : null}
      <Button
        type="button"
        variant="quiet"
        size="lg"
        className="max-md:w-full max-md:justify-start"
        onClick={toggleTheme}
      >
        {theme === "night" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {theme === "night" ? "白天" : "夜间"}
      </Button>
      <SignedOut>
        <a
          href="/login"
          className="flex h-10 min-h-10 items-center px-3 text-sm text-muted hover:text-fg max-md:w-full"
          onClick={() => setMore(false)}
        >
          登录保存纪要
        </a>
      </SignedOut>
      <SignedIn>
        <div className="flex items-center px-2 py-1 md:hidden">
          <UserButton />
        </div>
      </SignedIn>
    </>
  );

  return (
    <header className="mission-bar flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-line px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:gap-x-4 md:px-6 md:py-3">
      <button
        type="button"
        onClick={goHome}
        className="flex min-w-0 items-center gap-2 text-left md:gap-3"
        aria-label="首页"
      >
        <Mark className="size-6 shrink-0 text-fg" />
        <h1 className="text-base font-medium tracking-[0.22em] text-fg md:text-lg">
          ALONG
        </h1>
        <p className="hidden text-xs text-muted sm:block">跟课</p>
      </button>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
        <span className="go-dot" data-live={live} data-hold={mic === "denied"} />
        {live ? <span className="text-fg">听课中</span> : null}
        {arming ? <span className="text-fg">正在开麦…</span> : null}
        {paused ? <span>已暂停</span> : null}
        {atHome ? <span className="hidden sm:inline">首页</span> : null}
        {openClass && !reading ? (
          <button
            type="button"
            className="hidden text-xs text-muted hover:text-fg sm:inline"
            onClick={() => setSwitchMode((v) => !v)}
          >
            {modeLabel(liveMode)}
          </button>
        ) : null}
        {lastLatency != null ? (
          <span className="hidden font-mono tabular-nums text-dim sm:inline">
            {lastLatency} 毫秒
          </span>
        ) : null}
      </div>

      <div className="relative ml-auto flex items-center gap-1 md:gap-2">
        {isPending ? (
          <span className="hidden h-8 w-8 animate-pulse rounded-full bg-line sm:inline-block" />
        ) : (
          <>
            <SignedIn>
              <span className="hidden sm:inline">
                <UserButton />
              </span>
            </SignedIn>
            <SignedOut>
              <a href="/login" className="text-xs text-muted hover:text-fg">
                登录
              </a>
            </SignedOut>
          </>
        )}
        <div className="hidden items-center gap-1.5 md:flex">
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label={theme === "night" ? "白天" : "夜间"}
            className="size-9 min-h-9 min-w-9"
            onClick={toggleTheme}
          >
            {theme === "night" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          {openClass && !reading ? (
            <Button type="button" variant="quiet" size="lg" onClick={() => setJotOpen(true)}>
              <PenLine className="size-3.5" />
              记
            </Button>
          ) : null}
          {reading ? (
            <Button type="button" variant="quiet" size="lg" onClick={goHome}>
              {openClass ? "回课堂" : "首页"}
            </Button>
          ) : null}
          {showRecap && !reading ? (
            <Button
              type="button"
              variant="quiet"
              size="lg"
              onClick={() => openRecap()}
            >
              纪要
            </Button>
          ) : null}
          {openClass && !reading ? (
            <Button type="button" variant="end" size="lg" onClick={() => void endClass()}>
              结课
            </Button>
          ) : null}
        </div>
        {reading ? null : listenBtn}
        <Button
          type="button"
          variant="quiet"
          size="icon"
          className="size-10 min-h-10 min-w-10 md:hidden"
          aria-label="更多"
          onClick={() => setMore((v) => !v)}
        >
          <MoreHorizontal className="size-4" />
        </Button>
        {more ? (
          <div className="absolute right-0 top-[calc(100%+4px)] z-50 flex w-44 flex-col border border-line bg-elevated p-1 md:hidden">
            {extras}
          </div>
        ) : null}
      </div>
      {pick || switchMode ? (
        <ModeSheet
          title={pick ? "这堂怎么听" : "换成哪种课"}
          onPick={(mode) => {
            setClassMode(mode);
            setPick(false);
            setSwitchMode(false);
            if (pick) onArm(mode);
          }}
          onClose={() => {
            setPick(false);
            setSwitchMode(false);
          }}
        />
      ) : null}
    </header>
  );
}

function ModeSheet({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (mode: ClassMode) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/30 p-3 sm:items-center">
      <div className="w-full max-w-md border border-line bg-elevated p-4 shadow-lg">
        <p className="text-base font-medium tracking-tight">{title}</p>
        <p className="mt-1 text-sm text-muted">教练按这个跟。点错了顶栏还能改。</p>
        <ul className="mt-4 flex flex-col gap-2">
          {CLASS_MODES.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start border border-line bg-surface px-3 py-3 text-left hover:bg-elevated"
                onClick={() => onPick(m.id)}
              >
                <span className="text-sm font-medium text-fg">{m.label}</span>
                <span className="mt-0.5 text-sm text-muted">{m.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="quiet" size="lg" className="mt-3" onClick={onClose}>
          取消
        </Button>
      </div>
    </div>
  );
}
