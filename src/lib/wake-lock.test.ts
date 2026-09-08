import assert from "node:assert/strict";
import { test } from "node:test";
import { createWakeLock } from "./wake-lock.ts";

function fakeEnv(visible = true) {
  const listeners = new Set<() => void>();
  const sentinels: { released: boolean; fire: () => void }[] = [];
  let requests = 0;
  const state = { visibilityState: visible ? "visible" : "hidden" };
  const document = {
    get visibilityState() {
      return state.visibilityState;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  } as unknown as Document;
  const navigator = {
    wakeLock: {
      async request() {
        requests += 1;
        let onRelease: (() => void) | null = null;
        const s = {
          released: false,
          fire: () => onRelease?.(),
          async release() {
            s.released = true;
            onRelease?.();
          },
          addEventListener: (_: "release", fn: () => void) => {
            onRelease = fn;
          },
        };
        sentinels.push(s);
        return s;
      },
    },
  };
  return {
    env: { navigator, document },
    sentinels,
    get requests() {
      return requests;
    },
    show() {
      state.visibilityState = "visible";
      for (const fn of listeners) fn();
    },
    hide() {
      state.visibilityState = "hidden";
      for (const fn of listeners) fn();
    },
    get listeners() {
      return listeners.size;
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

test("on() takes the lock, off() releases it and stops listening", async () => {
  const f = fakeEnv();
  const lock = createWakeLock(f.env);
  lock.on();
  await settle();
  assert.equal(f.requests, 1);
  assert.equal(lock.held, true);
  lock.off();
  assert.equal(lock.held, false);
  assert.equal(f.sentinels[0]!.released, true);
  assert.equal(f.listeners, 0);
});

test("the browser drops the lock when the tab hides; it is taken again on return", async () => {
  const f = fakeEnv();
  const lock = createWakeLock(f.env);
  lock.on();
  await settle();
  f.hide();
  f.sentinels[0]!.fire(); // the browser released it
  assert.equal(lock.held, false);
  f.show();
  await settle();
  assert.equal(f.requests, 2);
  assert.equal(lock.held, true);
  lock.off();
});

test("no request while hidden, and on() twice is one lock", async () => {
  const f = fakeEnv(false);
  const lock = createWakeLock(f.env);
  lock.on();
  lock.on();
  await settle();
  assert.equal(f.requests, 0);
  f.show();
  await settle();
  assert.equal(f.requests, 1);
});

test("unsupported browsers: a silent no-op", async () => {
  const lock = createWakeLock({ navigator: {}, document: undefined });
  lock.on();
  await settle();
  assert.equal(lock.held, false);
  lock.off();
});
