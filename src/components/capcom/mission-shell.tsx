import { MissionBar } from "@/components/capcom/mission-bar";
import { DownlinkPanel } from "@/components/capcom/downlink-panel";
import { UplinkPanel } from "@/components/capcom/uplink-panel";
import { TranslatePanel } from "@/components/capcom/translate-panel";
import { AskPanel } from "@/components/capcom/ask-panel";
import { RecapPage } from "@/components/capcom/recap-page";
import { JotPad } from "@/components/capcom/jot-pad";
import {
  arm,
  ingest,
  safe,
  useCapcomEngine,
} from "@/components/capcom/use-engine";
import { useCapcom } from "@/lib/store";
import { applyTheme, readTheme } from "@/lib/theme";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

type BayTab = "down" | "up" | "tx" | "ask";

class ShellCatch extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { err: err.message || "界面出错了" };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(err, info);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex min-h-dvh flex-col gap-3 bg-bg p-6 text-fg">
          <p className="text-base">页面出错了，刷新即可。左侧仍可手写上课。</p>
          <p className="text-sm text-muted">{this.state.err}</p>
          <button
            type="button"
            className="self-start border border-line px-3 py-2 text-sm"
            onClick={() => this.setState({ err: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MissionShell() {
  return (
    <ShellCatch>
      <MissionShellInner />
    </ShellCatch>
  );
}

function MissionShellInner() {
  useCapcomEngine();
  const engineError = useCapcom((s) => s.engineError);
  const view = useCapcom((s) => s.view);
  const flash = useCapcom((s) => s.flash);
  const hydrateSessions = useCapcom((s) => s.hydrateSessions);
  const [tab, setTab] = useState<BayTab>("down");

  useEffect(() => {
    applyTheme(readTheme());
    hydrateSessions();
  }, [hydrateSessions]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "n" || e.key === "N") {
        const s = useCapcom.getState();
        const open = s.sessions.some((x) => x.id === s.liveId && !x.endedAt);
        if (!open) return;
        e.preventDefault();
        s.setJotOpen(!s.jotOpen);
      }
      if (e.key === "Escape") {
        const s = useCapcom.getState();
        if (s.jotOpen) {
          s.setJotOpen(false);
          e.preventDefault();
          return;
        }
        if (s.askOpen) {
          s.setAskOpen(false);
          e.preventDefault();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const liveClass =
    "min-h-0 " +
    (view === "recap"
      ? "pointer-events-none fixed top-0 left-0 h-px w-px overflow-hidden opacity-0"
      : "flex min-h-0 flex-1 flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 lg:grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:grid-rows-[minmax(0,1fr)_minmax(148px,190px)] lg:gap-4 lg:p-5");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <MissionBar onArm={arm} onSafe={safe} />
      {engineError ? (
        <p className="shrink-0 border-b border-line px-4 py-2 text-xs text-hold md:px-6">
          {engineError}
        </p>
      ) : null}
      {flash ? (
        <p className="pointer-events-none fixed top-16 left-1/2 z-40 -translate-x-1/2 border border-line bg-elevated px-3 py-1.5 text-xs text-fg">
          {flash}
        </p>
      ) : null}
      {view === "recap" ? <RecapPage /> : null}
      <main className={liveClass} aria-hidden={view === "recap"}>
        <nav className="mb-2 flex shrink-0 gap-1 lg:hidden">
          {(
            [
              ["down", "听课"],
              ["up", "教练"],
              ["tx", "翻译"],
              ["ask", "对话"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                "min-h-10 flex-1 border border-line px-2 text-sm " +
                (tab === id ? "bg-fg text-bg" : "bg-surface text-muted")
              }
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={(tab === "down" ? "flex " : "hidden lg:flex ") + "min-h-0 min-w-0 flex-1 flex-col"}>
          <DownlinkPanel onInject={(t) => ingest(t, "hand")} />
        </div>
        <div className={(tab === "up" ? "flex " : "hidden lg:flex ") + "min-h-0 min-w-0 flex-1 flex-col"}>
          <UplinkPanel />
        </div>
        <div className={(tab === "tx" ? "flex " : "hidden lg:flex ") + "min-h-0 min-w-0 flex-1 flex-col"}>
          <TranslatePanel />
        </div>
        <div className={(tab === "ask" ? "flex " : "hidden lg:flex ") + "min-h-0 min-w-0 flex-1 flex-col"}>
          <AskPanel />
        </div>
      </main>
      <JotPad />
    </div>
  );
}
