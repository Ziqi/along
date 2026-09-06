import type { ClassSession } from "@/lib/types";
import { formatDayTime } from "@/lib/utils";

export function recapMarkdown(session: ClassSession) {
  const recap = session.recap;
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(formatDayTime(session.startedAt));
  if (session.sourceTitle) lines.push(`由「${session.sourceTitle}」再出`);
  lines.push("");
  if (recap?.lede) {
    lines.push(recap.lede);
    lines.push("");
  }
  for (const o of recap?.outline ?? []) {
    lines.push(`## ${o.heading}`);
    for (const b of o.bullets) lines.push(`- ${b}`);
    lines.push("");
  }
  for (const sec of recap?.sections ?? []) {
    lines.push(`## ${sec.heading}`);
    lines.push("");
    lines.push(sec.body);
    lines.push("");
  }
  const dump = (title: string, items: { en: string; zh: string }[]) => {
    if (!items.length) return;
    lines.push(`## ${title}`);
    lines.push("");
    for (const it of items) {
      lines.push(`- ${it.en}${it.zh ? ` — ${it.zh}` : ""}`);
    }
    lines.push("");
  };
  dump("主题", recap?.topics ?? []);
  dump("句式", recap?.patterns ?? []);
  dump("句子", recap?.lines ?? []);
  dump("单词", recap?.words ?? []);
  if (session.notes.length) {
    lines.push("## 要点");
    lines.push("");
    for (const n of session.notes) {
      lines.push(`- ${n.en}${n.zh ? ` — ${n.zh}` : ""}`);
    }
    lines.push("");
  }
  if (session.transcript.length) {
    lines.push("## 实录");
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

export function printRecap(session: ClassSession) {
  const md = recapMarkdown(session)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${session.title}</title>
<style>
  body{font:16px/1.6 "IBM Plex Sans",serif;color:#1c1b17;max-width:40rem;margin:2rem auto;padding:0 1.5rem;white-space:pre-wrap}
  @media print { body { margin: 0; } }
</style></head><body>${md}</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    downloadText(`${session.title}.html`, html, "text/html");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
  };
}
