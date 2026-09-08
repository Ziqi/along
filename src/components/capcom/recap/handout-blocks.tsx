import { splitProse } from "@/lib/recap-kit";
import type { RecapPair, RecapTable } from "@/lib/types";

/** `*starred*` spans become underlined marks; everything else may still get term highlights. */
export function MarkText({ text, terms }: { text: string; terms?: string[] }) {
  const chunks = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2) {
          return (
            <mark key={i} className="bg-transparent font-medium underline decoration-fg/40 underline-offset-4">
              {chunk.slice(1, -1)}
            </mark>
          );
        }
        return <HighlightTerms key={i} text={chunk} terms={terms} />;
      })}
    </>
  );
}

export function HighlightTerms({ text, terms }: { text: string; terms?: string[] }) {
  const keys = (terms ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 40);
  if (!keys.length || !text) return <>{text}</>;
  const escaped = [...keys].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let re: RegExp;
  try {
    re = new RegExp(`(${escaped.join("|")})`, "gi");
  } catch {
    return <>{text}</>;
  }
  const parts = text.split(re);
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  return (
    <>
      {parts.map((p, i) =>
        lower.has(p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-hold/25 px-0.5 font-medium text-fg">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** A textarea that saves on blur. Remounts when the saved value changes underneath it. */
export function EditText({
  value,
  onSave,
  rows,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  rows: number;
  className?: string;
}) {
  return (
    <textarea
      defaultValue={value}
      key={value}
      rows={rows}
      onBlur={(e) => onSave(e.target.value)}
      className={"w-full resize-none border border-line bg-elevated px-2 py-1.5 focus:outline-none " + (className ?? "")}
    />
  );
}

/** Half-structured handout prose (`\n\n` paragraphs, `1.` / `-` lists) as blocks. */
export function ProseBlocks({ text, muted, terms }: { text: string; muted?: boolean; terms?: string[] }) {
  const blocks = splitProse(text);
  if (!blocks.length) return null;
  const body = muted ? "text-sm leading-relaxed text-muted text-pretty" : "text-base leading-8 text-fg text-pretty";
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, bi) =>
        b.type === "ol" ? (
          <ol key={bi} className="list-decimal space-y-2 pl-5">
            {b.items.map((l, li) => (
              <li key={li} className={body}>
                <MarkText text={l} terms={muted ? undefined : terms} />
              </li>
            ))}
          </ol>
        ) : b.type === "ul" ? (
          <ul key={bi} className="list-disc space-y-1 pl-5">
            {b.items.map((l, li) => (
              <li key={li} className={body}>
                <MarkText text={l} terms={muted ? undefined : terms} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={bi} className={body}>
            <MarkText text={b.items[0] ?? ""} terms={muted ? undefined : terms} />
          </p>
        ),
      )}
    </div>
  );
}

export function ContrastTable({ table }: { table: RecapTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] border-collapse text-left">
        <caption className="sr-only">
          {table.leftHead} vs {table.rightHead}
        </caption>
        <thead>
          <tr className="border-b border-line align-bottom">
            <th className="py-2 pr-4 font-medium text-fg">
              <span className="block text-sm">{table.leftHead}</span>
              {table.leftHeadZh ? (
                <span className="mt-0.5 block text-xs font-normal text-muted">{table.leftHeadZh}</span>
              ) : null}
            </th>
            <th className="py-2 font-medium text-fg">
              <span className="block text-sm">{table.rightHead}</span>
              {table.rightHeadZh ? (
                <span className="mt-0.5 block text-xs font-normal text-muted">{table.rightHeadZh}</span>
              ) : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={`${row.left}-${i}`} className="border-b border-line/70 align-top">
              <td className="py-2.5 pr-4">
                <p className="text-sm leading-snug text-fg">{row.left}</p>
                {row.leftZh ? <p className="mt-0.5 text-xs leading-snug text-muted">{row.leftZh}</p> : null}
              </td>
              <td className="py-2.5">
                <p className="text-sm leading-snug text-fg">{row.right}</p>
                {row.rightZh ? <p className="mt-0.5 text-xs leading-snug text-muted">{row.rightZh}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PairList({ kicker, items }: { kicker: string; items: RecapPair[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium tracking-tight">{kicker}</h2>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th className="py-2 pr-3 font-normal">英文</th>
            <th className="py-2 font-normal">中文</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.en} className="border-b border-line/70 align-top">
              <td className="py-2.5 pr-3 text-sm font-medium leading-snug text-fg">{it.en}</td>
              <td className="py-2.5 text-sm leading-snug text-muted">{it.zh}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A bilingual numbered list (takeaways, skills). */
export function PairOl({ items, terms }: { items: RecapPair[]; terms?: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5">
      {items.map((t) => (
        <li key={t.en} className="pl-1">
          <p className="text-base leading-relaxed text-fg">
            <MarkText text={t.en} terms={terms} />
          </p>
          {t.zh ? <p className="text-sm leading-relaxed text-muted">{t.zh}</p> : null}
        </li>
      ))}
    </ol>
  );
}
