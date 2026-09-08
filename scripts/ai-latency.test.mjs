import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAiLog, render, summarise } from "./ai-latency.mjs";

const log = [
  'vite ready',
  '[ai] {"tag":"translate","model":"grok-4.20-0309-non-reasoning","ms":700,"ok":true,"status":200}',
  '[ai] {"tag":"translate","model":"grok-4.20-0309-non-reasoning","ms":900,"ok":true,"status":200}',
  '[ai] {"tag":"translate","model":"grok-4.20-0309-non-reasoning","ms":8000,"ok":false,"reason":"timeout"}',
  '[ai] {"tag":"coach.primary","model":"grok-4.6","ms":4200,"ok":true,"status":200}',
  '[ai] {"tag":"coach.primary","model":"grok-4.6","ms":69,"ok":false,"status":403,"reason":"upstream"}',
  '[ai] {"tag":"stt.secret","model":"realtime","ms":62,"ok":false,"status":403}',
  'garbage [ai] {not json',
].join("\n");

test("parses only well-formed [ai] lines", () => {
  const rows = parseAiLog(log);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].tag, "translate");
});

test("summarises per tag and model with success rate, percentiles and failure reasons", () => {
  const s = summarise(parseAiLog(log));
  const translate = s.find((g) => g.tag === "translate");
  assert.equal(translate.calls, 3);
  assert.equal(Math.round(translate.okRate * 100), 67);
  assert.equal(translate.p50, 700, "percentiles come from successful calls");
  assert.equal(translate.max, 8000, "max covers every call, so a timeout shows");
  assert.deepEqual(translate.reasons, ["timeout×1"]);
  const coach = s.find((g) => g.tag === "coach.primary");
  assert.deepEqual(coach.reasons, ["upstream 403×1"]);
  const stt = s.find((g) => g.tag === "stt.secret");
  assert.equal(stt.okRate, 0);
  assert.equal(stt.p50, 62, "with no success the percentiles fall back to every call");
});

test("renders one row per group and says so when the log is empty", () => {
  const out = render(summarise(parseAiLog(log)));
  assert.match(out, /coach\.primary\s+grok-4\.6\s+2\s+50%/);
  assert.equal(render([]), "no [ai] lines found");
});
