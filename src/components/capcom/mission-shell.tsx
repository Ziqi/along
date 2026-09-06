import { MissionBar } from "@/components/capcom/mission-bar";
import { DownlinkPanel } from "@/components/capcom/downlink-panel";
import { UplinkPanel } from "@/components/capcom/uplink-panel";
import { TranslatePanel } from "@/components/capcom/translate-panel";
import { AskPanel } from "@/components/capcom/ask-panel";
import { RecapPage } from "@/components/capcom/recap-page";
import {
  arm,
  ingest,
  openRecap,
  runSim,
  safe,
  useCapcomEngine,
} from "@/components/capcom/use-engine";
import { useCapcom } from "@/lib/store";
import { applyTheme, readTheme } from "@/lib/theme";
import { useEffect } from "react";

export function MissionShell() {
  useCapcomEngine();
  const engineError = useCapcom((s) => s.engineError);
  const view = useCapcom((s) => s.view);
  const flash = useCapcom((s) => s.flash);
  const hydrateSessions = useCapcom((s) => s.hydrateSessions);

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
        e.preventDefault();
        if (useCapcom.getState().view === "recap") useCapcom.getState().setView("live");
        else openRecap();
      }
      if (e.key === "Escape") {
        const s = useCapcom.getState();
        if (s.askOpen) {
          s.setAskOpen(false);
          e.preventDefault();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <MissionBar onArm={arm} onSafe={safe} onSim={runSim} />
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
      {view === "recap" ? (
        <RecapPage />
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1.25fr)_minmax(0,1.2fr)_minmax(108px,128px)_minmax(150px,175px)] gap-3 p-3 md:gap-4 md:p-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:grid-rows-[minmax(0,1fr)_minmax(148px,190px)] lg:p-5">
          <DownlinkPanel onInject={ingest} />
          <UplinkPanel />
          <TranslatePanel />
          <AskPanel />
        </main>
      )}
    </div>
  );
}