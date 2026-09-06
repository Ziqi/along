import { useEffect, useState } from "react";
import { Mic, Moon, Pause, PenLine, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/capcom/mark";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { useCapcom } from "@/lib/store";
import { endClass, openRecap, retryPendingZh } from "@/components/capcom/use-engine";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type Props = {
  onArm: () => void;
  onSafe: () => void;
};

export function MissionBar({ onArm, onSafe }: Props) {
  const mic = useCapcom((s) => s.mic);
  const lastLatency = useCapcom((s) => s.lastLatency);
  const liveId = useCapcom((s) => s.liveId);
  const sessions = useCapcom((s) => s.sessions);
  const view = useCapcom((s) => s.view);
  const setView = useCapcom((s) => s.setView);
  const goHome = useCapcom((s) => s.goHome);
  const setJotOpen = useCapcom((s) => s.setJotOpen);
  const live = mic === "live";
  const openClass = sessions.some((s) => s.id === liveId && !s.endedAt);
  const paused = !live && openClass;
  const [theme, setTheme] = useState<Theme>("day");
  const { isPending } = useCurrentUserState();

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

  const canEnd = live || openClass;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 md:gap-x-4 md:px-6 md:py-3">
      <button
        type="button"
        onClick={goHome}
        className="flex min-w-0 items-center gap-3 text-left"
        aria-label="回课堂"
      >
        <Mark className="size-6 shrink-0 text-fg" />
        <h1 className="text-base font-medium tracking-[0.22em] text-fg md:text-lg">
          ALONG
        </h1>
        <p className="hidden text-xs text-muted sm:block">跟课</p>
      </button>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="go-dot" data-live={live} data-hold={mic === "denied"} />
        {live ? <span className="text-fg">听课中</span> : null}
        {paused && !live ? <span>已暂停</span> : null}
        {lastLatency != null ? (
          <span className="hidden font-mono tabular-nums text-dim sm:inline">
            {lastLatency} 毫秒
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
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
              <a href="/login" className="hidden text-xs text-muted hover:text-fg sm:inline">
                登录保存
              </a>
            </SignedOut>
          </>
        )}
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
        <Button
          type="button"
          variant="quiet"
          size="lg"
          onClick={() => setJotOpen(true)}
        >
          <PenLine className="size-3.5" />
          记
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="lg"
          onClick={() => {
            if (view === "recap") {
              setView("live");
              retryPendingZh();
            } else {
              openRecap();
            }
          }}
        >
          {view === "recap" ? "回课堂" : "纪要"}
        </Button>
        {canEnd ? (
          <Button type="button" variant="quiet" size="lg" onClick={() => void endClass()}>
            结课
          </Button>
        ) : null}
        {live ? (
          <Button type="button" variant="safe" size="lg" onClick={onSafe}>
            <Pause className="size-3.5" />
            暂停
          </Button>
        ) : (
          <Button type="button" variant="arm" size="lg" onClick={onArm}>
            <Mic className="size-4" />
            {paused ? "继续听" : "开始听"}
          </Button>
        )}
      </div>
    </header>
  );
}