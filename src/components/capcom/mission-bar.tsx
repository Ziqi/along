import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Mic, Moon, MoreHorizontal, Pause, PenLine, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuLink } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";
import { Mark } from "@/components/capcom/mark";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { useCapcom } from "@/lib/store";
import { endClass, goHomeSafe, openRecap } from "@/lib/engine";
import { CLASS_MODES, modeLabel, parseClassMode, type ClassMode } from "@/lib/class-mode";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type Props = {
  onArm: (mode?: ClassMode) => void;
  onSafe: () => void;
};

/**
 * The top bar. Its right end holds the one filled action for the moment:
 * 开始听 before a class, 记要点 while one is open — that is what a student does
 * most in class — with the mic toggle outlined beside it. 结课 is a quiet word
 * that asks first; it must never be the loudest thing on the screen.
 */
export function MissionBar({ onArm, onSafe }: Props) {
  const mic = useCapcom((s) => s.mic);
  const listening = useCapcom((s) => s.listening);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const pathname = useLocation({ select: (l) => l.pathname });
  const setJotOpen = useCapcom((s) => s.setJotOpen);
  const live = listening || mic === "live";
  const arming = listening && mic === "arming";
  const openClass = sessions.some((s) => s.id === liveId && !s.endedAt);
  const paused = !live && !arming && openClass;
  // `/` is the classroom; every other face under the shell is the handout side.
  const reading = pathname !== "/";
  const inClassHere = openClass && !reading;
  const atHome = !reading && !openClass;
  const showRecap = sessions.length > 0 || openClass;
  const classMode = useCapcom((s) => s.classMode);
  const setClassMode = useCapcom((s) => s.setClassMode);
  const [theme, setTheme] = useState<Theme>("day");
  const [pick, setPick] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { isPending } = useCurrentUserState();
  const liveMode = parseClassMode(
    sessions.find((s) => s.id === liveId && !s.endedAt)?.classMode ?? classMode,
  );

  useEffect(() => {
    const next = readTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    if (!openClass) setConfirmEnd(false);
  }, [openClass]);

  function toggleTheme() {
    const next = theme === "night" ? "day" : "night";
    setTheme(next);
    applyTheme(next);
  }

  const themeLabel = theme === "night" ? "白天" : "夜间";
  const themeIcon = theme === "night" ? <Sun className="size-4" /> : <Moon className="size-4" />;
  const homeLabel = openClass ? "回课堂" : "首页";

  // One step down on a phone: the bar is a single row there.
  const phoneStep = "max-md:h-10 max-md:px-3 max-md:text-sm";

  const listenBtn = live ? (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className={phoneStep + " max-md:w-10 max-md:px-0"}
      onClick={onSafe}
      aria-label="暂停"
    >
      <Pause className="size-4" />
      <span className="max-md:sr-only">暂停</span>
    </Button>
  ) : (
    <Button
      type="button"
      variant={openClass ? "secondary" : "primary"}
      size="lg"
      className={phoneStep + (openClass ? " max-md:w-10 max-md:px-0" : "")}
      onClick={() => {
        if (paused || openClass) onArm();
        else setPick(true);
      }}
      disabled={arming}
      aria-label={arming ? "开麦中" : paused ? "继续听" : "开始听"}
    >
      <Mic className="size-4" />
      <span className={openClass ? "max-md:sr-only" : ""}>{arming ? "开麦中" : paused ? "继续听" : "开始听"}</span>
    </Button>
  );

  const noteBtn = (
    <Button type="button" variant="primary" size="lg" className={phoneStep} onClick={() => setJotOpen(true)}>
      <PenLine className="size-4" />
      记要点
    </Button>
  );

  return (
    <header className="mission-bar flex shrink-0 items-center gap-x-3 border-b border-line px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] md:gap-x-5 md:px-6 md:py-3">
      <button
        type="button"
        onClick={goHomeSafe}
        className="flex min-w-0 shrink-0 items-center gap-2 text-left md:gap-3"
        aria-label="首页"
      >
        <Mark className="size-6 shrink-0 text-fg" />
        <h1 className="text-base font-medium tracking-[0.2em] text-fg md:text-lg">ALONG</h1>
        <p className="hidden text-sm text-muted sm:block">跟课</p>
      </button>
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <span className="go-dot shrink-0" data-live={live} data-hold={mic === "denied"} />
        <span className="hidden min-w-0 truncate sm:block">
          {live ? <span className="font-medium text-fg">听课中</span> : null}
          {arming ? <span className="font-medium text-fg">正在开麦…</span> : null}
          {paused ? <span className="text-muted">已暂停</span> : null}
          {atHome ? <span className="text-muted">首页</span> : null}
          {inClassHere ? <span className="text-muted"> · 这堂是{modeLabel(liveMode)}</span> : null}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        {isPending ? (
          <span className="hidden h-8 w-8 animate-pulse rounded-full bg-line sm:inline-block" />
        ) : (
          <>
            <SignedIn>
              <span className="hidden opacity-70 sm:inline">
                <UserButton />
              </span>
            </SignedIn>
            <SignedOut>
              <a href="/login" className="hidden text-sm text-dim hover:text-muted sm:inline">
                登录
              </a>
            </SignedOut>
          </>
        )}

        <div className="hidden items-center gap-1 md:flex">
          <Button type="button" variant="quiet" size="icon" aria-label={themeLabel} onClick={toggleTheme}>
            {themeIcon}
          </Button>
          {reading ? (
            <Button type="button" variant="quiet" size="lg" onClick={goHomeSafe}>
              {homeLabel}
            </Button>
          ) : null}
          {showRecap && !reading ? (
            <Button type="button" variant="quiet" size="lg" onClick={() => openRecap()}>
              纪要
            </Button>
          ) : null}
          {inClassHere ? (
            <Button type="button" variant="quiet" size="lg" onClick={() => setConfirmEnd(true)}>
              结课
            </Button>
          ) : null}
        </div>

        {reading ? null : listenBtn}
        {inClassHere ? noteBtn : null}

        <Menu
          label={<MoreHorizontal className="size-4" />}
          aria-label="更多"
          align="right"
          size="icon"
          className="md:hidden"
          panelClassName="w-44"
        >
          {reading ? <MenuItem onSelect={goHomeSafe}>{homeLabel}</MenuItem> : null}
          {showRecap && !reading ? <MenuItem onSelect={() => openRecap()}>纪要</MenuItem> : null}
          {inClassHere ? <MenuItem onSelect={() => setConfirmEnd(true)}>结课</MenuItem> : null}
          <MenuItem onSelect={toggleTheme}>
            {themeIcon}
            {themeLabel}
          </MenuItem>
          <SignedOut>
            <MenuLink href="/login">登录保存纪要</MenuLink>
          </SignedOut>
          <SignedIn>
            <div className="flex items-center px-2 py-1">
              <UserButton />
            </div>
          </SignedIn>
        </Menu>
      </div>

      {pick ? (
        <ModeSheet
          onPick={(mode) => {
            setClassMode(mode);
            setPick(false);
            onArm(mode);
          }}
          onClose={() => setPick(false)}
        />
      ) : null}
      {confirmEnd ? (
        <Confirm
          title="结课？"
          body="结课后马上进纪要，这堂就不能再接着听了。只是想歇一下，用暂停。"
          confirmLabel="结课"
          danger
          onConfirm={() => {
            setConfirmEnd(false);
            void endClass();
          }}
          onCancel={() => setConfirmEnd(false)}
        />
      ) : null}
    </header>
  );
}

function ModeSheet({
  onPick,
  onClose,
}: {
  onPick: (mode: ClassMode) => void;
  onClose: () => void;
}) {
  return (
    <Sheet label="这堂怎么听" onClose={onClose}>
      <p className="text-lg font-medium tracking-tight">这堂怎么听</p>
      <p className="mt-1 text-sm text-muted">
        先选一种。上课不能改。想换课型，先结课再开一堂。
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {CLASS_MODES.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="flex w-full flex-col items-start border border-line bg-surface px-3 py-3 text-left hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
              onClick={() => onPick(m.id)}
            >
              <span className="text-base font-medium text-fg">{m.label}</span>
              <span className="mt-0.5 text-sm text-muted">{m.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="quiet" size="lg" className="mt-3" onClick={onClose}>
        取消
      </Button>
    </Sheet>
  );
}
