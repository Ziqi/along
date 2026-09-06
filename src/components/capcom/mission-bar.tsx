import { useEffect, useState } from "react";
import { Mic, Moon, Pause, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/capcom/mark";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { useCapcom } from "@/lib/store";
import { endClass } from "@/components/capcom/use-engine";

type Props = {
  onArm: () => void;
  onSafe: () => void;
  onSim: () => void;
};

export function MissionBar({ onArm, onSafe, onSim }: Props) {
  const mic = useCapcom((s) => s.mic);
  const lastLatency = useCapcom((s) => s.lastLatency);
  const captions = useCapcom((s) => s.captions);
  const liveId = useCapcom((s) => s.liveId);
  const view = useCapcom((s) => s.view);
  const setView = useCapcom((s) => s.setView);
  const goHome = useCapcom((s) => s.goHome);
  const live = mic === "live";
  const paused = !live && (captions.length > 0 || Boolean(liveId));
  const [theme, setTheme] = useState<Theme>("day");

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

  const canEnd = captions.length > 0 || live || Boolean(liveId);

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
          onClick={() => setView(view === "notes" ? "live" : "notes")}
        >
          {view === "notes" ? "回课堂" : "笔记"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="lg"
          onClick={() => setView(view === "recap" ? "live" : "recap")}
        >
          {view === "recap" ? "回课堂" : "纪要"}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onSim}>
          听课
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