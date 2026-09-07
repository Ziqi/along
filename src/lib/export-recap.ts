import type { ClassSession, RecapStudy, RecapTable } from "@/lib/types";
import { isStudyAppendix, recapAppendixCopy } from "@/lib/class-mode";
import { splitProse } from "@/lib/recap-kit";
import { formatDayTime } from "@/lib/utils";

function mdStars(s: string) {
  return s.replace(/\*/g, "**");
}

function tableMarkdown(table: RecapTable) {
  const lines = [
    `| ${table.leftHead} | ${table.rightHead} |`,
    "| --- | --- |",
  ];
  for (const row of table.rows) {
    lines.push(`| ${row.left} | ${row.right} |`);
    if (row.leftZh || row.rightZh) {
      lines.push(`| ${row.leftZh || ""} | ${row.rightZh || ""} |`);
    }
  }
  return lines;
}

function dumpStudyMd(title: string, items: RecapStudy[]) {
  if (!items.length) return [];
  const lines = [`### ${title}`, ""];
  for (const it of items) {
    lines.push(`**${it.en}**${it.zh ? ` · ${it.zh}` : ""}`);
    if (it.use) lines.push(`- 用法：${it.use}${it.useZh ? `（${it.useZh}）` : ""}`);
    if (it.example) lines.push(`- 例句：${mdStars(it.example)}`);
    if (it.exampleZh) lines.push(`- ${it.exampleZh}`);
    lines.push("");
  }
  return lines;
}

export function recapMarkdown(session: ClassSession, opts?: { tape?: boolean }) {
  const recap = session.recap;
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(formatDayTime(session.startedAt));
  if (session.sourceTitle) lines.push(`From: ${session.sourceTitle}`);
  lines.push("");
  if (recap?.lede) {
    lines.push(mdStars(recap.lede));
    lines.push("");
  }
  if (recap?.ledeZh) {
    lines.push(recap.ledeZh);
    lines.push("");
  }
  if ((recap?.takeaways ?? []).length) {
    lines.push("## 要点");
    lines.push("");
    recap!.takeaways.forEach((t, i) => {
      lines.push(`${i + 1}. ${mdStars(t.en)}`);
      if (t.zh) lines.push(`   ${t.zh}`);
    });
    lines.push("");
  }
  for (const sec of recap?.sections ?? []) {
    lines.push(`## ${sec.heading}`);
    if (sec.headingZh) lines.push(`*${sec.headingZh}*`);
    lines.push("");
    lines.push(mdStars(sec.body));
    lines.push("");
    if (sec.table) {
      lines.push(...tableMarkdown(sec.table));
      lines.push("");
    }
    if (sec.bodyZh) {
      lines.push(sec.bodyZh);
      lines.push("");
    }
  }
  const hasStudy =
    (recap?.words.length ?? 0) +
      (recap?.collos.length ?? 0) +
      (recap?.patterns.length ?? 0) +
      (recap?.grammar.length ?? 0) +
      (recap?.lines.length ?? 0) >
    0;
  if (hasStudy) {
    lines.push("## 语言点");
    lines.push("");
    lines.push(...dumpStudyMd("单词", recap?.words ?? []));
    lines.push(...dumpStudyMd("搭配", recap?.collos ?? []));
    lines.push(...dumpStudyMd("句式", recap?.patterns ?? []));
    lines.push(...dumpStudyMd("语法", recap?.grammar ?? []));
    lines.push(...dumpStudyMd("好例句", recap?.lines ?? []));
  }
  const appendix = recapAppendixCopy(isStudyAppendix(session.classMode, recap?.coachPack ?? []));
  if ((recap?.skills ?? []).length) {
    lines.push(`## ${appendix.skills}`);
    lines.push("");
    recap!.skills.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.en}`);
      if (t.zh) lines.push(`   ${t.zh}`);
    });
    lines.push("");
  }
  if ((recap?.coachPack ?? []).length) {
    lines.push(appendix.md);
    lines.push("");
    for (const c of recap!.coachPack) {
      lines.push(`### ${c.topic}${c.topicZh ? ` · ${c.topicZh}` : ""}`);
      if (c.briefEn) lines.push(c.briefEn);
      if (c.briefZh) lines.push(c.briefZh);
      c.options.forEach((o, i) => {
        lines.push(`${i + 1}. ${o.en}${o.zh ? ` — ${o.zh}` : ""}`);
      });
      if (c.deep) {
        lines.push("");
        lines.push(`#### DeepSearch · ${c.deep.title}`);
        if (c.deep.viewEn) lines.push(c.deep.viewEn);
        if (c.deep.viewZh) lines.push(c.deep.viewZh);
        for (const f of c.deep.facts) lines.push(`- ${f.en}${f.zh ? ` — ${f.zh}` : ""}`);
        if (c.deep.aEn) lines.push(c.deep.aEn);
      }
      lines.push("");
    }
  }
  if (session.notes.length) {
    lines.push("## 课堂随手记");
    lines.push("");
    for (const n of session.notes) {
      lines.push(`- ${n.en}${n.zh ? ` — ${n.zh}` : ""}`);
    }
    lines.push("");
  }
  if (opts?.tape && session.transcript.length) {
    lines.push("## 课堂实录");
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stars(s: string) {
  return esc(s).replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
}

function proseHtml(text: string, muted = false) {
  const cls = muted ? " class=\"zh\"" : "";
  return splitProse(text)
    .map((b) => {
      if (b.type === "ol") {
        return `<ol>${b.items.map((it) => `<li><p${cls}>${stars(it)}</p></li>`).join("")}</ol>`;
      }
      if (b.type === "ul") {
        return `<ul>${b.items.map((it) => `<li><p${cls}>${stars(it)}</p></li>`).join("")}</ul>`;
      }
      return `<p${cls}>${stars(b.items[0] ?? "")}</p>`;
    })
    .join("");
}

function tableHtml(table: RecapTable) {
  const head = `<tr><th>${esc(table.leftHead)}${table.leftHeadZh ? `<span class="zh"> ${esc(table.leftHeadZh)}</span>` : ""}</th><th>${esc(table.rightHead)}${table.rightHeadZh ? `<span class="zh"> ${esc(table.rightHeadZh)}</span>` : ""}</th></tr>`;
  const rows = table.rows
    .map(
      (row) =>
        `<tr><td><p>${esc(row.left)}</p>${row.leftZh ? `<p class="zh">${esc(row.leftZh)}</p>` : ""}</td><td><p>${esc(row.right)}</p>${row.rightZh ? `<p class="zh">${esc(row.rightZh)}</p>` : ""}</td></tr>`,
    )
    .join("");
  return `<table class="contrast"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function studyCards(title: string, items: RecapStudy[]) {
  if (!items.length) return "";
  const cards = items
    .map((it) => {
      const use = it.use ? `<p>${esc(it.use)}</p>` : "";
      const useZh = it.useZh ? `<p class="zh">${esc(it.useZh)}</p>` : "";
      const ex = it.example ? `<p>${stars(it.example)}</p>` : "";
      const exZh = it.exampleZh ? `<p class="zh">${esc(it.exampleZh)}</p>` : "";
      return `<article class="card"><p class="en">${esc(it.en)}</p>${it.zh ? `<p class="zh">${esc(it.zh)}</p>` : ""}${use}${useZh}${ex}${exZh}</article>`;
    })
    .join("");
  return `<h3>${esc(title)}</h3><div class="cards">${cards}</div>`;
}

export function printRecap(session: ClassSession, opts?: { tape?: boolean }) {
  const recap = session.recap;
  const appendix = recapAppendixCopy(isStudyAppendix(session.classMode, recap?.coachPack ?? []));
  const sections = (recap?.sections ?? [])
    .map(
      (sec, i) =>
        `<h2>${i + 1}. ${esc(sec.heading)}</h2>${sec.headingZh ? `<p class="zh">${esc(sec.headingZh)}</p>` : ""}${proseHtml(sec.body)}${sec.table ? tableHtml(sec.table) : ""}${sec.bodyZh ? proseHtml(sec.bodyZh, true) : ""}`,
    )
    .join("");
  const notes = session.notes.length
    ? `<h2>课堂随手记</h2><ul>${session.notes.map((n) => `<li>${esc(n.en)}${n.zh ? ` — ${esc(n.zh)}` : ""}</li>`).join("")}</ul>`
    : "";
  const tape =
    opts?.tape && session.transcript.length
      ? `<h2>课堂实录</h2><ol>${session.transcript.map((t) => `<li><p>${esc(t.en)}</p>${t.zh ? `<p class="zh">${esc(t.zh)}</p>` : ""}</li>`).join("")}</ol>`
      : "";
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(session.title)}</title>
<style>
  @page { margin: 16mm; }
  body{font:16px/1.6 "IBM Plex Sans","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;color:#1c1b17;max-width:42rem;margin:0 auto;padding:1.5rem}
  h1{font-size:1.8rem;font-weight:500;letter-spacing:-.02em;margin:0 0 .25rem}
  h2{font-size:1.2rem;font-weight:500;margin:1.6rem 0 .4rem}
  h3{font-size:1rem;font-weight:500;margin:1.2rem 0 .4rem}
  p{margin:.45rem 0}
  ol,ul{margin:.4rem 0 .8rem;padding-left:1.3rem}
  li{margin:.25rem 0}
  .zh{color:#5c5850;font-size:.92rem}
  .meta{color:#8a857a;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase}
  .part{color:#8a857a;font-size:.85rem;margin:2rem 0 .2rem}
  .cards{display:block}
  .card{break-inside:avoid;border-top:1px solid #d8d0c3;padding:.7rem 0}
  table.contrast{width:100%;border-collapse:collapse;margin:0.8rem 0 1rem;font-size:0.92rem}
  table.contrast th,table.contrast td{border-top:1px solid #d8d0c3;padding:0.45rem 0.6rem 0.45rem 0;text-align:left;vertical-align:top}
  table.contrast th{font-weight:600}
  .en{font-weight:600}
  strong{font-weight:600;text-decoration:underline;text-underline-offset:3px}
  @media print { body { padding: 0; } a { color: inherit; } }
</style></head><body>
<p class="meta">${esc(formatDayTime(session.startedAt))}</p>
<h1>${esc(session.title)}</h1>
${recap?.lede || recap?.sections.length ? `<p class="part">本堂内容</p>` : ""}
${recap?.lede ? `<p>${stars(recap.lede)}</p>` : ""}
${recap?.ledeZh ? `<p class="zh">${esc(recap.ledeZh)}</p>` : ""}
${
  (recap?.takeaways ?? []).length
    ? `<h2>要点</h2><ol>${recap!.takeaways.map((t) => `<li><p>${stars(t.en)}</p>${t.zh ? `<p class="zh">${esc(t.zh)}</p>` : ""}</li>`).join("")}</ol>`
    : ""
}
${sections}
${
  (recap?.words.length || recap?.collos.length || recap?.patterns.length || recap?.grammar.length || recap?.lines.length)
    ? `<p class="part">语言点</p><h2>语言点</h2>${studyCards("单词", recap?.words ?? [])}${studyCards("搭配", recap?.collos ?? [])}${studyCards("句式", recap?.patterns ?? [])}${studyCards("语法", recap?.grammar ?? [])}${studyCards("好例句", recap?.lines ?? [])}`
    : ""
}
${
  (recap?.skills ?? []).length
    ? `<h2>${esc(appendix.skills)}</h2><ol>${recap!.skills.map((t) => `<li><p>${esc(t.en)}</p>${t.zh ? `<p class="zh">${esc(t.zh)}</p>` : ""}</li>`).join("")}</ol>`
    : ""
}
${
  (recap?.coachPack ?? []).length
    ? `<p class="part">${esc(appendix.htmlPart)}</p><h2>${esc(appendix.htmlHeading)}</h2>${recap!.coachPack
        .map((c) => {
          const opts = c.options
            .map((o) => `<li><p>${esc(o.en)}</p>${o.zh ? `<p class="zh">${esc(o.zh)}</p>` : ""}</li>`)
            .join("");
          const deep = c.deep
            ? `<h3>DeepSearch · ${esc(c.deep.title)}</h3>${c.deep.viewEn ? `<p>${esc(c.deep.viewEn)}</p>` : ""}${c.deep.viewZh ? `<p class="zh">${esc(c.deep.viewZh)}</p>` : ""}${
                c.deep.facts.length
                  ? `<ol>${c.deep.facts.map((f) => `<li>${esc(f.en)}${f.zh ? ` — ${esc(f.zh)}` : ""}</li>`).join("")}</ol>`
                  : ""
              }${c.deep.aEn ? `<p>${esc(c.deep.aEn)}</p>` : ""}${c.deep.aZh ? `<p class="zh">${esc(c.deep.aZh)}</p>` : ""}`
            : "";
          return `<h3>${esc(c.topic)}</h3>${c.topicZh ? `<p class="zh">${esc(c.topicZh)}</p>` : ""}${c.briefEn ? `<p>${esc(c.briefEn)}</p>` : ""}${c.briefZh ? `<p class="zh">${esc(c.briefZh)}</p>` : ""}<ol>${opts}</ol>${deep}`;
        })
        .join("")}`
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
