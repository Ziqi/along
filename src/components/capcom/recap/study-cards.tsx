import type { RecapStudy } from "@/lib/types";
import { EditText, MarkText } from "./handout-blocks";

/** One group of the language points (words / collocations / patterns / grammar / lines). */
export function StudyCards({
  kicker,
  items,
  editing,
  onChange,
}: {
  kicker: string;
  items: RecapStudy[];
  editing?: boolean;
  onChange?: (next: RecapStudy[]) => void;
}) {
  if (!items.length && !editing) return null;
  function patch(i: number, field: keyof RecapStudy, value: string) {
    if (!onChange) return;
    onChange(items.map((it, n) => (n === i ? { ...it, [field]: value } : it)));
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-medium tracking-tight">{kicker}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <article key={`${it.en}-${i}`} className="flex flex-col gap-2 border border-line bg-elevated px-4 py-3">
            {editing ? (
              <>
                <EditText value={it.en} rows={2} className="text-base font-medium" onSave={(v) => patch(i, "en", v)} />
                <EditText value={it.zh} rows={2} className="text-sm text-muted" onSave={(v) => patch(i, "zh", v)} />
                <p className="text-sm text-dim">用法</p>
                <EditText value={it.use} rows={2} className="text-sm" onSave={(v) => patch(i, "use", v)} />
                <EditText value={it.useZh} rows={2} className="text-sm text-muted" onSave={(v) => patch(i, "useZh", v)} />
                <p className="text-sm text-dim">例句</p>
                <EditText value={it.example} rows={2} className="text-sm" onSave={(v) => patch(i, "example", v)} />
                <EditText
                  value={it.exampleZh}
                  rows={2}
                  className="text-sm text-muted"
                  onSave={(v) => patch(i, "exampleZh", v)}
                />
              </>
            ) : (
              <>
                <p className="text-base font-medium leading-snug text-fg">{it.en}</p>
                {it.zh ? <p className="text-sm text-muted">{it.zh}</p> : null}
                {it.use || it.useZh ? (
                  <div>
                    <p className="text-sm text-dim">用法</p>
                    {it.use ? <p className="text-sm text-fg">{it.use}</p> : null}
                    {it.useZh ? <p className="text-sm text-muted">{it.useZh}</p> : null}
                  </div>
                ) : null}
                {it.example || it.exampleZh ? (
                  <div>
                    <p className="text-sm text-dim">例句</p>
                    {it.example ? (
                      <p className="text-sm text-fg text-pretty">
                        <MarkText text={it.example} />
                      </p>
                    ) : null}
                    {it.exampleZh ? <p className="text-sm text-muted text-pretty">{it.exampleZh}</p> : null}
                  </div>
                ) : null}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
