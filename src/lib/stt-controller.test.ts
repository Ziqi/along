import assert from "node:assert/strict";
import { test } from "node:test";
import { STT_FRAME_SAMPLES, STT_RATE, pcm16From } from "./stt-controller.ts";

test("16 kHz in → 16 kHz out: samples pass through as int16", () => {
  const out = pcm16From(new Float32Array([0, 0.5, -0.5, 1, -1, 2]), STT_RATE);
  assert.deepEqual([...out], [0, 16383, -16384, 32767, -32768, 32767]);
});

test("48 kHz → 16 kHz: every output sample is the mean of the three it covers", () => {
  // Three samples per output; alternating ±1 at 24 kHz is pure aliasing noise and averages out.
  const buzz = new Float32Array(48).map((_, i) => (i % 2 ? 1 : -1));
  const quiet = pcm16From(buzz, 48000);
  assert.equal(quiet.length, 16);
  for (const s of quiet) assert.ok(Math.abs(s) <= 0x7fff / 3 + 1, `aliasing survives: ${s}`);
  // A slow tone (constant within each window) comes through at full level.
  const tone = new Float32Array(48).map((_, i) => (Math.floor(i / 3) % 2 ? 0.5 : -0.5));
  const kept = pcm16From(tone, 48000);
  assert.deepEqual([...kept].slice(0, 4), [-16384, 16383, -16384, 16383]);
});

test("44.1 kHz → 16 kHz: the window slides in fractional steps and never runs past the buffer", () => {
  const n = 1024;
  const ramp = new Float32Array(n).map((_, i) => i / n);
  const out = pcm16From(ramp, 44100);
  assert.equal(out.length, Math.floor(n / (44100 / 16000)));
  for (let i = 1; i < out.length; i++) assert.ok(out[i]! >= out[i - 1]!, "a ramp stays monotonic");
  assert.ok(out[out.length - 1]! <= 0x7fff);
});

test("a frame is 100 ms of 16 kHz audio", () => {
  assert.equal(STT_FRAME_SAMPLES, 1600);
});
