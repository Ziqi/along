import { useState } from "react";
import { DownlinkPanel } from "@/components/capcom/downlink-panel";
import { UplinkPanel } from "@/components/capcom/uplink-panel";

type Tab = "down" | "up";

/** The classroom: captions on the left, coach on the right; two tabs on a phone. */
export function Classroom() {
  const [tab, setTab] = useState<Tab>("down");
  return (
    <main className="flex min-h-0 flex-1 flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 lg:p-5">
      <nav className="mb-2 flex shrink-0 gap-1 lg:hidden">
        {(
          [
            ["down", "听课"],
            ["up", "教练"],
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
        <DownlinkPanel />
      </div>
      <div className={(tab === "up" ? "flex " : "hidden lg:flex ") + "min-h-0 min-w-0 flex-1 flex-col"}>
        <UplinkPanel />
      </div>
    </main>
  );
}
