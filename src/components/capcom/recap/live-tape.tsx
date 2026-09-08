/** The class transcript, folded under the handout. */
export function LiveTape({ lines }: { lines: { en: string; zh: string }[] }) {
  const shown = lines.filter((l) => l.en);
  if (!shown.length) return null;
  return (
    <details className="border-t border-line pt-8">
      <summary className="cursor-pointer text-xl font-medium tracking-tight">课堂实录</summary>
      <p className="mt-2 text-sm text-muted">下载时可勾选带上。英文在前。</p>
      <ul className="mt-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
        {shown.map((l, i) => (
          <li key={`${i}-${l.en.slice(0, 24)}`}>
            <p className="text-sm leading-snug text-fg text-pretty">{l.en}</p>
            {l.zh ? (
              <p className="mt-0.5 text-sm leading-snug text-muted text-pretty">{l.zh}</p>
            ) : (
              <p className="mt-0.5 text-xs text-dim">译…</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
