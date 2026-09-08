/** An English line with the coach's key words marked. */
export function MarkedEn({ text, keys }: { text: string; keys?: string[] }) {
  const marks = (keys ?? []).filter((k) => k.length > 1);
  if (!marks.length) return text;
  const re = new RegExp(`(${marks.map(escapeRe).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        marks.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
          <mark key={`${part}-${i}`} className="key">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
        ),
      )}
    </>
  );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
