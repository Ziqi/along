function completeObjects(src: string) {
  const out: unknown[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf("{", i);
    if (start < 0) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let closed = false;
    for (let j = start; j < src.length; j += 1) {
      const c = src[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            out.push(JSON.parse(src.slice(start, j + 1)));
          } catch {
            /* skip broken object */
          }
          i = j + 1;
          closed = true;
          break;
        }
      }
    }
    if (!closed) break;
  }
  return out;
}

function salvageJsonObject(raw: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const lede = raw.match(/"lede"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (lede) {
    try {
      out.lede = JSON.parse(`"${lede[1]}"`);
    } catch {
      out.lede = lede[1];
    }
  }
  const ledeZh = raw.match(/"ledeZh"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (ledeZh) {
    try {
      out.ledeZh = JSON.parse(`"${ledeZh[1]}"`);
    } catch {
      out.ledeZh = ledeZh[1];
    }
  }
  const title = raw.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (title) {
    try {
      out.title = JSON.parse(`"${title[1]}"`);
    } catch {
      out.title = title[1];
    }
  }
  const secAt = raw.indexOf('"sections"');
  if (secAt >= 0) {
    const bracket = raw.indexOf("[", secAt);
    if (bracket >= 0) {
      const sections = completeObjects(raw.slice(bracket)).filter((row) => {
        if (!row || typeof row !== "object") return false;
        const body = (row as { body?: unknown }).body;
        return typeof body === "string" && body.trim().length > 40;
      });
      if (sections.length) out.sections = sections;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const raw = text.slice(start);
  const end = raw.lastIndexOf("}");
  if (end > 0) {
    try {
      return JSON.parse(raw.slice(0, end + 1)) as Record<string, unknown>;
    } catch {
      /* repair below */
    }
  }
  let s = raw.trim().replace(/,\s*$/, "");
  const oddQuotes = ((s.replace(/\\"/g, "").match(/"/g) ?? []).length) % 2 === 1;
  if (oddQuotes) s += '"';
  const openSq = (s.match(/\[/g) ?? []).length - (s.match(/]/g) ?? []).length;
  const openBr = (s.match(/{/g) ?? []).length - (s.match(/}/g) ?? []).length;
  s += "]".repeat(Math.max(0, openSq)) + "}".repeat(Math.max(0, openBr));
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return salvageJsonObject(raw);
  }
}
