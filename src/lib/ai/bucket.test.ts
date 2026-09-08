import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAiBuckets, takeAiToken } from "./bucket.ts";
import { AI_LIMITS } from "./limits.ts";

beforeEach(() => resetAiBuckets());

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
