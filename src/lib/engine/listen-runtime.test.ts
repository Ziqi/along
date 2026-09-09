import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { SttHandlers } from "../stt-controller.ts";
import type { SpeechHandlers } from "../speech-controller.ts";
import type { ClassEvent } from "./class-machine.ts";
import { noNav, type AiApi } from "./context.ts";
import { STT_ATTEMPTS, STT_RETRY_MS, createListenRuntime, type Backend, type ListenDeps } from "./listen-runtime.ts";

type Fake = {
  listening: boolean;
  mic: string;
  interim: string;
  engineError: string | null;
  sttBackend: "xai" | "browser" | null;
  sttNote: string | null;
  setListening: (on: boolean) => void;
  setMic: (mic: string) => void;
  setInterim: (t: string) => void;
  setEngineError: (msg: string | null) => void;
  setSttBackend: (backend: "xai" | "browser" | null, note?: string | null) => void;
};

function fakeStore() {
  const state: Fake = {
    listening: true,
    mic: "arming",
    interim: "",
    engineError: null,
    sttBackend: null,
    sttNote: null,
    setListening: (on) => {
      state.listening = on;
    },
    setMic: (mic) => {
      state.mic = mic;
    },
    setInterim: (t) => {
      state.interim = t;
    },
    setEngineError: (msg) => {
      state.engineError = msg;
    },
    setSttBackend: (backend, note = null) => {
      state.sttBackend = backend;
      state.sttNote = backend === "browser" ? note : null;
    },
  };
  return { state, getState: () => state as unknown as AppState };
}

type Mint = AiApi["mintStt"];

function api(mintStt: Mint): AiApi {
  const never = (() => {
    throw new Error("not used in this test");
  }) as unknown;
  return {
    mintStt,
    translate: never as AiApi["translate"],
    quick: never as AiApi["quick"],
    say: never as AiApi["say"],
    coach: never as AiApi["coach"],
    expand: never as AiApi["expand"],
    recap: never as AiApi["recap"],
    segment: never as AiApi["segment"],
    catchUp: never as AiApi["catchUp"],
  };
}

/** A recorded recognizer: the test decides when it connects or fails. */
class FakeBackend implements Backend {
  started = 0;
  stopped = 0;
  handlers: SttHandlers | SpeechHandlers;
  constructor(handlers: SttHandlers | SpeechHandlers) {
    this.handlers = handlers;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
    this.handlers.onPartial("");
    this.handlers.onState(false);
  }
}

function harness(mint: Mint) {
  const store = fakeStore();
  const events: ClassEvent[] = [];
  const heard: string[] = [];
  const stts: FakeBackend[] = [];
  const speeches: FakeBackend[] = [];
  const mints: (() => Promise<string>)[] = [];
  const deps: ListenDeps = {
    micSupported: () => true,
    speechSupported: () => true,
    requestMic: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
    makeStt: (handlers, m) => {
      const b = new FakeBackend(handlers);
      stts.push(b);
      mints.push(m);
      return b;
    },
    makeSpeech: (handlers) => {
      const b = new FakeBackend(handlers);
      speeches.push(b);
      return b;
    },
  };
  const listen = createListenRuntime(
    { store, api: api(mint), nav: noNav, now: Date.now },
    { onFinal: (t) => heard.push(t), dispatch: (e) => (events.push(e), true) },
    deps,
  );
  return { store, events, heard, stts, speeches, mints, listen };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe("listen runtime", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("xAI answers: the store says so and the machine hears mic_live", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    await settle();
    assert.equal(h.stts.length, 1);
    assert.equal(await h.mints[0]!(), "t");
    h.stts[0]!.handlers.onState(true);
    assert.equal(h.store.state.mic, "live");
    assert.equal(h.store.state.sttBackend, "xai");
    assert.equal(h.store.state.sttNote, null);
    assert.deepEqual(h.events, ["mic_live"]);
    h.stts[0]!.handlers.onFinal("Hello class.");
    assert.deepEqual(h.heard, ["Hello class."]);
  });

  it("one failure is retried on xAI before anything else happens", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    await settle();
    h.stts[0]!.handlers.onError("stt");
    assert.equal(h.stts[0]!.stopped, 1);
    assert.equal(h.speeches.length, 0, "no browser recognizer yet");
    assert.match(h.store.state.engineError ?? "", /再试一次/);
    assert.equal(h.store.state.listening, true, "still arming, the student did nothing wrong");
    mock.timers.tick(STT_RETRY_MS);
    await settle();
    assert.equal(h.stts.length, 2, "a fresh xAI controller");
    h.stts[1]!.handlers.onState(true);
    assert.equal(h.store.state.sttBackend, "xai");
    assert.equal(h.store.state.engineError, null);
  });

  it("after the last failure the browser takes over — visibly, with the reason the server gave", async () => {
    const h = harness(async () => ({ ok: false, code: "rate_limited", error: "太频繁了，稍等一下。" }));
    h.listen.start();
    await settle();
    for (let i = 0; i < STT_ATTEMPTS; i += 1) {
      await assert.rejects(h.mints[i]!(), /太频繁/);
      h.stts[i]!.handlers.onError("stt");
      if (i < STT_ATTEMPTS - 1) {
        mock.timers.tick(STT_RETRY_MS);
        await settle();
      }
    }
    assert.equal(h.speeches.length, 1);
    assert.equal(h.speeches[0]!.started, 1);
    assert.equal(h.store.state.sttBackend, "browser");
    assert.match(h.store.state.sttNote ?? "", /请求太多/);
    assert.match(h.store.state.sttNote ?? "", /浏览器听写/);
    h.speeches[0]!.handlers.onState(true);
    assert.equal(h.store.state.mic, "live");
    assert.equal(h.store.state.sttBackend, "browser", "going live does not hide which recognizer it is");
    assert.deepEqual(h.events, ["mic_live"]);
  });

  it("a key xAI refuses is named as such, so nobody hunts for a network problem", async () => {
    const h = harness(async () => ({ ok: false, code: "upstream", error: "xAI 错误 403", status: 403 }));
    h.listen.start();
    await settle();
    for (let i = 0; i < STT_ATTEMPTS; i += 1) {
      await assert.rejects(h.mints[i]!(), /403/);
      h.stts[i]!.handlers.onError("stt");
      if (i < STT_ATTEMPTS - 1) {
        mock.timers.tick(STT_RETRY_MS);
        await settle();
      }
    }
    assert.equal(h.store.state.sttBackend, "browser");
    assert.match(h.store.state.sttNote ?? "", /拒绝了.*钥匙/);
    assert.match(h.store.state.sttNote ?? "", /403/);
  });

  it("the two tries are per connection: a blip an hour after a live connection gets its own retry", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    await settle();
    h.stts[0]!.handlers.onError("stt"); // first connection never came up
    mock.timers.tick(STT_RETRY_MS);
    await settle();
    h.stts[1]!.handlers.onState(true); // second one is live
    assert.equal(h.store.state.sttBackend, "xai");
    h.stts[1]!.handlers.onError("stt"); // an hour later the socket dies
    mock.timers.tick(STT_RETRY_MS);
    await settle();
    assert.equal(h.stts.length, 3, "a third xAI controller, not the browser");
    assert.equal(h.speeches.length, 0);
  });

  it("start() twice before the mic answers keeps exactly one controller", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    h.listen.start();
    await settle();
    assert.equal(h.stts.length, 2, "two mic requests were made");
    assert.equal(h.stts[0]!.stopped, 1, "the first is stopped as soon as the second arrives");
    assert.equal(h.stts[1]!.stopped, 0);
  });

  it("a browser recognizer that errors is stopped with the class", async () => {
    const h = harness(async () => ({ ok: false, code: "unavailable", error: "AI 暂不可用" }));
    h.listen.start();
    await settle();
    for (let i = 0; i < STT_ATTEMPTS; i += 1) {
      await assert.rejects(h.mints[i]!());
      h.stts[i]!.handlers.onError("stt");
      if (i < STT_ATTEMPTS - 1) {
        mock.timers.tick(STT_RETRY_MS);
        await settle();
      }
    }
    const speech = h.speeches[0]!;
    speech.handlers.onState(true);
    speech.handlers.onError("network");
    assert.equal(speech.stopped, 1, "not left running while the class shows paused");
    assert.equal(h.store.state.listening, false);
  });

  it("a stale controller cannot drop the one on the mic", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    await settle();
    const first = h.stts[0]!;
    first.handlers.onError("stt");
    mock.timers.tick(STT_RETRY_MS);
    await settle();
    const second = h.stts[1]!;
    // The dead socket reports once more (open timeout) and hears a late line.
    first.handlers.onError("stt");
    first.handlers.onFinal("ghost line");
    assert.equal(second.stopped, 0, "the live controller is untouched");
    assert.equal(h.speeches.length, 0, "and no fallback was started");
    assert.deepEqual(h.heard, [], "a stale controller's lines are dropped");
    second.handlers.onState(true);
    assert.equal(h.store.state.sttBackend, "xai");
  });

  it("stop during the retry wait cancels it and clears the recognizer badge", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    await settle();
    h.stts[0]!.handlers.onError("stt");
    h.store.state.listening = false;
    h.listen.stop();
    mock.timers.tick(STT_RETRY_MS * 2);
    await settle();
    assert.equal(h.stts.length, 1, "no retry after stop");
    assert.equal(h.speeches.length, 0);
    assert.equal(h.store.state.sttBackend, null);
  });

  it("mic denied is final: no retry, no browser fallback", async () => {
    const h = harness(async () => ({ ok: true, token: "t" }));
    h.listen.start();
    await settle();
    h.stts[0]!.handlers.onError("denied");
    mock.timers.tick(STT_RETRY_MS * 2);
    await settle();
    assert.equal(h.store.state.mic, "denied");
    assert.equal(h.store.state.listening, false);
    assert.equal(h.stts.length, 1);
    assert.equal(h.speeches.length, 0);
    assert.deepEqual(h.events, ["mic_failed"]);
  });
});
