import { recapStageView, type RecapStage } from "@/lib/recap-stage";

/** Where the handout write is: essay first, then the language points. */
export function RecapProgress({ stage }: { stage: RecapStage | null }) {
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
        {stage === "study" ? "正文已经铺在下面。语言点写完会接在后面。" : "先写导语和章节。写出来会先落在这张纸上，再填词表。"}
      </p>
    </div>
  );
}
