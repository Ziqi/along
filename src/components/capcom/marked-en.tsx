export function MarkedEn({ text, keys }: { text: string; keys?: string[] }) {
  const marks = (keys ?? []).filter((k) => k.length > 1);
  if (!marks.length) return text;
  const re = new RegExp(`(${marks.map(escapeRe).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        marks.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
          <em key={`${part}-${i}`} className="key">
            {part}
          </em>
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