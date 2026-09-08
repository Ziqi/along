#!/usr/bin/env node
/**
 * Summarise the `[ai] {...}` lines the server writes for every model call:
 * per tag and model, how many calls, how many succeeded, and the p50 / p95 /
 * max latency, plus the failure reasons seen. This is how model choices get
 * judged with numbers instead of impressions.
 *
 *   node scripts/ai-latency.mjs /tmp/app-startup.log
 *   vercel logs <deployment> | node scripts/ai-latency.mjs
 */
import { readFileSync } from "node:fs";

/** Parse every `[ai] {...}` line into its JSON entry; anything else is skipped. */
export function parseAiLog(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf("[ai] {");
    if (at < 0) continue;
    try {
      const row = JSON.parse(line.slice(at + 5));
      if (row && typeof row.tag === "string" && typeof row.ms === "number") rows.push(row);
    } catch {
      /* a torn line */
    }
  }
  return rows;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

/** Group by `tag · model`, sorted by tag then call count. */
export function summarise(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.tag} · ${row.model ?? "?"}`;
    const g = groups.get(key) ?? { tag: row.tag, model: row.model ?? "?", n: 0, ok: 0, ms: [], okMs: [], reasons: new Map() };
    g.n += 1;
    g.ms.push(row.ms);
    if (row.ok) {
      g.ok += 1;
      g.okMs.push(row.ms);
    } else {
      const why = [row.reason, row.status].filter((x) => x !== undefined && x !== null).join(" ") || "fail";
      g.reasons.set(why, (g.reasons.get(why) ?? 0) + 1);
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const all = [...g.ms].sort((a, b) => a - b);
      const good = [...g.okMs].sort((a, b) => a - b);
      return {
        tag: g.tag,
        model: g.model,
        calls: g.n,
        okRate: g.n ? g.ok / g.n : 0,
        p50: percentile(good.length ? good : all, 50),
        p95: percentile(good.length ? good : all, 95),
        max: all.at(-1) ?? 0,
        reasons: [...g.reasons.entries()].sort((a, b) => b[1] - a[1]).map(([why, n]) => `${why}×${n}`),
      };
    })
    .sort((a, b) => a.tag.localeCompare(b.tag) || b.calls - a.calls);
}

export function render(summary) {
  if (!summary.length) return "no [ai] lines found";
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  const lines = [
    `${pad("tag", 20)} ${pad("model", 30)} ${num("calls", 5)} ${num("ok", 5)} ${num("p50", 7)} ${num("p95", 7)} ${num("max", 7)}  failures`,
  ];
  for (const g of summary) {
    lines.push(
      `${pad(g.tag, 20)} ${pad(g.model, 30)} ${num(g.calls, 5)} ${num(`${Math.round(g.okRate * 100)}%`, 5)} ${num(`${g.p50}ms`, 7)} ${num(`${g.p95}ms`, 7)} ${num(`${g.max}ms`, 7)}  ${g.reasons.join(", ")}`,
    );
  }
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly) {
  const path = process.argv[2];
  const text = path ? readFileSync(path, "utf8") : readFileSync(0, "utf8");
  console.log(render(summarise(parseAiLog(text))));
}
