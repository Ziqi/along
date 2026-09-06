import type { ClassSession } from "@/lib/types";
import { formatDayTime } from "@/lib/utils";

export function recapMarkdown(session: ClassSession, opts?: { tape?: boolean }) {
  const recap = session.recap;
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(formatDayTime(session.startedAt));
  if (session.sourceTitle) lines.push(`From: ${session.sourceTitle}`);
  lines.push("");
  if (recap?.lede) {
    lines.push(recap.lede.replace(/\*/g, "**"));
    lines.push("");
  }
  if (recap?.ledeZh) {
    lines.push(recap.ledeZh);
    lines.push("");
  }
  for (const o of recap?.outline ?? []) {
    lines.push(`## ${o.heading}`);
    for (const b of o.bullets) lines.push(`- ${b}`);
    lines.push("");
  }
  if ((recap?.takeaways ?? []).length) {
    lines.push("## Takeaways");
    lines.push("");
    recap!.takeaways.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.en.replace(/\*/g, "**")}${t.zh ? ` — ${t.zh}` : ""}`);
    });
    lines.push("");
  }
  for (const sec of recap?.sections ?? []) {
    lines.push(`## ${sec.heading}`);
    if (sec.headingZh) lines.push(`*${sec.headingZh}*`);
    lines.push("");
    lines.push(sec.body.replace(/\*/g, "**"));
    lines.push("");
    if (sec.bodyZh) {
      lines.push(sec.bodyZh);
      lines.push("");
    }
  }
  const dump = (title: string, items: { en: string; zh: string }[]) => {
    if (!items.length) return;
    lines.push(`## ${title}`);
    lines.push("");
    lines.push("| English | 中文 |");
    lines.push("|---|---|");
    for (const it of items) {
      lines.push(`| ${it.en.replace(/\|/g, "\\|")} | ${(it.zh || "").replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  };
  const dumpStudy = (
    title: string,
    items: { en: string; zh: string; use?: string; useZh?: string; example?: string; exampleZh?: string }[],
  ) => {
    if (!items.length) return;
    lines.push(`## ${title}`);
    lines.push("");
    lines.push("| English | 中文 | Usage | Example |");
    lines.push("|---|---|---|---|");
    for (const it of items) {
      const use = [it.use, it.useZh].filter(Boolean).join(" / ");
      const ex = [it.example, it.exampleZh].filter(Boolean).join(" / ");
      lines.push(
        `| ${it.en.replace(/\|/g, "\\|")} | ${(it.zh || "").replace(/\|/g, "\\|")} | ${use.replace(/\|/g, "\\|")} | ${ex.replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  };
  dump("Topics", recap?.topics ?? []);
  dumpStudy("Words", recap?.words ?? []);
  dumpStudy("Collocations", recap?.collos ?? []);
  dumpStudy("Patterns", recap?.patterns ?? []);
  dumpStudy("Grammar", recap?.grammar ?? []);
  dumpStudy("Key sentences", recap?.lines ?? []);
  if ((recap?.skills ?? []).length) {
    lines.push("## Speaking moves");
    lines.push("");
    recap!.skills.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.en}${t.zh ? ` — ${t.zh}` : ""}`);
    });
    lines.push("");
  }
  if (session.notes.length) {
    lines.push("## Notes");
    lines.push("");
    for (const n of session.notes) {
      lines.push(`- ${n.en}${n.zh ? ` — ${n.zh}` : ""}`);
    }
    lines.push("");
  }
  if (opts?.tape && session.transcript.length) {
    lines.push("## Appendix · Transcript");
    lines.push("");
    for (const t of session.transcript) {
      lines.push(`- ${t.en}${t.zh ? ` — ${t.zh}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s: string) {
  return s
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function stars(s: string) {
  return esc(s).replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
}

export function printRecap(session: ClassSession, opts?: { tape?: boolean }) {
  const recap = session.recap;
  const table = (title: string, items: { en: string; zh: string }[]) => {
    if (!items.length) return "";
    const rows = items
      .map((it) => `<tr><td>${esc(it.en)}</td><td>${esc(it.zh || "")}</td></tr>`)
      .join("");
    return `<h2>${esc(title)}</h2><table><thead><tr><th>English</th><th>中文</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const study = (
    title: string,
    items: { en: string; zh: string; use?: string; useZh?: string; example?: string; exampleZh?: string }[],
  ) => {
    if (!items.length) return "";
    const rows = items
      .map((it) => {
        const use = `${esc(it.use || "")}${it.useZh ? `<div class="zh">${esc(it.useZh)}</div>` : ""}`;
        const ex = `${it.example ? stars(it.example) : ""}${it.exampleZh ? `<div class="zh">${esc(it.exampleZh)}</div>` : ""}`;
        return `<tr><td>${esc(it.en)}</td><td>${esc(it.zh || "")}</td><td>${use}</td><td>${ex}</td></tr>`;
      })
      .join("");
    return `<h2>${esc(title)}</h2><table><thead><tr><th>English</th><th>中文</th><th>Usage</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  const sections = (recap?.sections ?? [])
    .map(
      (sec) =>
        `<h2>${esc(sec.heading)}</h2>${sec.headingZh ? `<p class="zh">${esc(sec.headingZh)}</p>` : ""}<p>${stars(sec.body)}</p>${sec.bodyZh ? `<p class="zh">${esc(sec.bodyZh)}</p>` : ""}`,
    )
    .join("");
  const outline = (recap?.outline ?? [])
    .map(
      (o) =>
        `<h3>${esc(o.heading)}</h3><ul>${o.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
    )
    .join("");
  const notes = session.notes.length
    ? `<h2>Notes</h2><ul>${session.notes.map((n) => `<li>${esc(n.en)}${n.zh ? ` — ${esc(n.zh)}` : ""}</li>`).join("")}</ul>`
    : "";
  const tape =
    opts?.tape && session.transcript.length
      ? `<h2>Appendix · Transcript</h2><ol>${session.transcript.map((t) => `<li><p>${esc(t.en)}</p>${t.zh ? `<p class="zh">${esc(t.zh)}</p>` : ""}</li>`).join("")}</ol>`
      : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(session.title)}</title>
<style>
  @page { margin: 18mm; }
  body{font:16px/1.55 "IBM Plex Sans",Georgia,serif;color:#1c1b17;max-width:40rem;margin:0 auto;padding:1.5rem}
  h1{font-size:1.8rem;font-weight:500;letter-spacing:-.02em;margin:0 0 .25rem}
  h2{font-size:1.2rem;font-weight:500;margin:1.6rem 0 .4rem}
  h3{font-size:1rem;font-weight:500;margin:1rem 0 .25rem}
  p{margin:.4rem 0}
  .zh{color:#5c5850;font-size:.92rem}
  .meta{color:#8a857a;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin:.5rem 0 1rem;font-size:.92rem}
  th,td{text-align:left;vertical-align:top;padding:.45rem .4rem;border-bottom:1px solid #d8d0c3}
  th{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#8a857a;font-weight:400}
  strong{font-weight:600;text-decoration:underline;text-underline-offset:3px}
  @media print { body { padding: 0; } a { color: inherit; } }
</style></head><body>
<p class="meta">${esc(formatDayTime(session.startedAt))}</p>
<h1>${esc(session.title)}</h1>
${recap?.lede ? `<p>${stars(recap.lede)}</p>` : ""}
${recap?.ledeZh ? `<p class="zh">${esc(recap.ledeZh)}</p>` : ""}
${
  (recap?.takeaways ?? []).length
    ? `<h2>Takeaways</h2><ol>${recap!.takeaways.map((t) => `<li><p>${stars(t.en)}</p>${t.zh ? `<p class="zh">${esc(t.zh)}</p>` : ""}</li>`).join("")}</ol>`
    : ""
}
${outline}
${sections}
${table("Topics", recap?.topics ?? [])}
${study("Words", recap?.words ?? [])}
${study("Collocations", recap?.collos ?? [])}
${study("Patterns", recap?.patterns ?? [])}
${study("Grammar", recap?.grammar ?? [])}
${study("Key sentences", recap?.lines ?? [])}
${
  (recap?.skills ?? []).length
    ? `<h2>Speaking moves</h2><ol>${recap!.skills.map((t) => `<li><p>${esc(t.en)}</p>${t.zh ? `<p class="zh">${esc(t.zh)}</p>` : ""}</li>`).join("")}</ol>`
    : ""
}
${notes}
${tape}
</body></html>`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 4000);
  };
  if (doc.readyState === "complete") window.setTimeout(go, 50);
  else frame.onload = go;
}
