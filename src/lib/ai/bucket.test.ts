import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAiBuckets, takeAiToken, type AiCaller } from "./bucket.ts";
import { AI_LIMITS, IP_SHARE } from "./limits.ts";

beforeEach(() => resetAiBuckets());

const student = (n: number, ip = "10.0.0.1"): AiCaller => ({ key: `d:device-${n}-xxxxxxxx`, ipKey: `ip:${ip}`, userId: null });

test("a classroom behind one router: each device keeps its own allowance", () => {
  const t0 = 2_000_000;
  // Thirty students each translate a full minute's worth at the same instant.
  for (let n = 0; n < 30; n += 1) {
    for (let i = 0; i < AI_LIMITS.translate; i += 1) {
      assert.equal(takeAiToken(student(n), "translate", t0).ok, true, `student ${n} call ${i + 1}`);
    }
    assert.equal(takeAiToken(student(n), "translate", t0).ok, false, `student ${n} is capped on their own`);
  }
  assert.equal(takeAiToken(student(31), "translate", t0).ok, true, "a 31st student is untouched by the others");
});

test("one address rotating device ids still meets the IP ceiling", () => {
  const t0 = 3_000_000;
  const ceiling = AI_LIMITS.stt * IP_SHARE;
  let passed = 0;
  for (let n = 0; n < ceiling + 5; n += 1) {
    if (takeAiToken(student(n, "203.0.113.9"), "stt", t0).ok) passed += 1;
  }
  assert.equal(passed, ceiling);
  assert.equal(takeAiToken(student(999, "203.0.113.9"), "stt", t0).ok, false);
  assert.equal(takeAiToken(student(999, "203.0.113.10"), "stt", t0).ok, true, "another address is untouched");
});

test("a refused call takes nothing from either bucket", () => {
  const t0 = 4_000_000;
  const a = student(1, "198.51.100.1");
  for (let i = 0; i < AI_LIMITS.recap; i += 1) takeAiToken(a, "recap", t0);
  assert.equal(takeAiToken(a, "recap", t0).ok, false);
  // The IP bucket was charged only for the calls that went through.
  const spentOnIp = AI_LIMITS.recap;
  const b = student(2, "198.51.100.1");
  let ok = 0;
  for (let i = 0; i < AI_LIMITS.recap * IP_SHARE; i += 1) {
    if (takeAiToken({ ...b, key: `d:rot-${i}-xxxxxxxx` }, "recap", t0).ok) ok += 1;
  }
  assert.equal(ok, AI_LIMITS.recap * IP_SHARE - spentOnIp);
});

test("a signed-in user is one caller across devices; a plain string key still works", () => {
  const t0 = 6_000_000;
  const phone: AiCaller = { key: "u:alice", ipKey: "ip:1.1.1.1", userId: "alice" };
  const laptop: AiCaller = { key: "u:alice", ipKey: "ip:2.2.2.2", userId: "alice" };
  for (let i = 0; i < AI_LIMITS.deep; i += 1) assert.equal(takeAiToken(i % 2 ? phone : laptop, "deep", t0).ok, true);
  assert.equal(takeAiToken(phone, "deep", t0).ok, false);
  assert.equal(takeAiToken(laptop, "deep", t0).ok, false);
  assert.equal(takeAiToken("u:bob", "deep", t0).ok, true);
});

test("a caller gets exactly the per-minute allowance as a burst, then is refused", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < AI_LIMITS.recap; i += 1) {
    assert.equal(takeAiToken("u:a", "recap", t0).ok, true, `call ${i + 1} should pass`);
  }
  const denied = takeAiToken("u:a", "recap", t0);
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.code, "rate_limited");
    assert.match(denied.error, /太频繁/);
  }
});

test("tokens refill with time and buckets are per caller and per kind", () => {
  const t0 = 5_000_000;
  for (let i = 0; i < AI_LIMITS.stt; i += 1) takeAiToken("ip:1.2.3.4", "stt", t0);
  assert.equal(takeAiToken("ip:1.2.3.4", "stt", t0).ok, false);
  assert.equal(takeAiToken("ip:9.9.9.9", "stt", t0).ok, true, "another caller is untouched");
  assert.equal(takeAiToken("ip:1.2.3.4", "translate", t0).ok, true, "another kind is untouched");
  const oneSlot = Math.ceil(60_000 / AI_LIMITS.stt) + 1;
  assert.equal(takeAiToken("ip:1.2.3.4", "stt", t0 + oneSlot).ok, true, "one slot refilled");
  assert.equal(takeAiToken("ip:1.2.3.4", "stt", t0 + oneSlot).ok, false);
});
