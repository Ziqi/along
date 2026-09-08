import { modeLabel, parseClassMode } from "@/lib/class-mode";
import { sampleList } from "@/lib/samples";

/**
 * First-visit guidance: two finished handouts to open before any class of
 * one's own. They live at `/class/<id>` as read-only pages, never in the
 * catalog, so the counts on the left stay honest.
 */
export function SampleLinks({ onPick }: { onPick: (id: string) => void }) {
  const samples = sampleList();
  if (!samples.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sample-links-title">
      <p id="sample-links-title" className="text-sm text-muted">
        先看看一份讲义长什么样：
      </p>
      <ul className="flex flex-col divide-y divide-line/60 border-y border-line/60">
        {samples.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.id)}
              className="flex w-full flex-col items-start gap-0.5 px-1 py-3 text-left hover:bg-surface"
            >
              <span className="text-xs text-dim">
                示例 · {modeLabel(parseClassMode(s.classMode))}
              </span>
              <span className="text-base font-medium leading-snug text-fg">{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
