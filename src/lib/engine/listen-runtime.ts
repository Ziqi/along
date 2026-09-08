import type { AiErrorCode } from "../ai/errors.ts";
import { SpeechController, speechSupported, type SpeechHandlers } from "../speech-controller.ts";
import { micErrorCode, micSupported, requestMic, SttController, type SttHandlers } from "../stt-controller.ts";
import type { ClassEvent } from "./class-machine.ts";
import type { EngineContext } from "./context.ts";

type Hooks = {
  onFinal: (text: string) => void;
  /** Report a machine event; returns false when the machine refused it. */
  dispatch: (event: ClassEvent) => boolean;
};

/** The two recognizers as the runtime drives them; tests hand in fakes. */
export type Backend = { start(stream?: MediaStream): unknown; stop(): void };
export type ListenDeps = {
  micSupported: () => boolean;
  speechSupported: () => boolean;
  requestMic: () => Promise<MediaStream>;
  makeStt: (handlers: SttHandlers, mint: () => Promise<string>) => Backend;
  makeSpeech: (handlers: SpeechHandlers) => Backend;
};

const realDeps: ListenDeps = {
  micSupported,
  speechSupported,
  requestMic,
  makeStt: (handlers, mint) => new SttController(handlers, mint),
  makeSpeech: (handlers) => new SpeechController(handlers),
};

/** How many times the xAI recognizer is tried per 开始听 before the browser's takes over. */
export const STT_ATTEMPTS = 2;
export const STT_RETRY_MS = 1500;

const framed = () => {
  try {
    return typeof window !== "undefined" && window.top !== window;
  } catch {
    return true;
  }
};

/** What to tell the student when the browser's recognizer is on instead of xAI's. */
export function browserSpeechNote(reason: AiErrorCode | "stt" | null): string {
  const tail = "浏览器听写慢、不准、会漏句。点暂停再点继续听，会再试实时听写。";
  switch (reason) {
    case "rate_limited":
      return `实时听写这一分钟请求太多，先用浏览器听写。${tail}`;
    case "unavailable":
    case "no_stt_secret":
      return `这个部署没有实时听写的钥匙，用的是浏览器听写。${tail}`;
    default:
      return `实时听写两次都没接上，先用浏览器听写。${tail}`;
  }
}

/**
 * Owns the speech backend: xAI STT over the mic when it can be reached, the
 * browser's own recognizer as the fallback — never silently. xAI is tried
 * `STT_ATTEMPTS` times per 开始听; when it still fails the store says which
 * recognizer is on and why, so a slow, repetitive transcript is never a
 * mystery. Everything heard goes to `onFinal`; every state change goes
 * through the class machine.
 */
export function createListenRuntime(ctx: EngineContext, hooks: Hooks, deps: ListenDeps = realDeps) {
  const { store, api } = ctx;
  let controller: Backend | null = null;
  let attempts = 0;
  let lastMintFail: AiErrorCode | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  function onError(code: string) {
    const s = store.getState();
    s.setListening(false);
    s.setSttBackend(null);
    hooks.dispatch("mic_failed");
    if (code === "denied") {
      s.setMic("denied");
      s.setEngineError(
        framed()
          ? "这一页拦了麦克风。请在地址栏允许麦克风，或用系统浏览器打开本页。"
          : "麦克风被拒绝。点地址栏的锁允许麦克风，再点「开始听」。",
      );
      return;
    }
    if (code === "unsupported") {
      s.setMic("unsupported");
      s.setEngineError("此浏览器不能听写。请用 Chrome / Safari。");
      return;
    }
    s.setMic("idle");
    s.setEngineError("实时听写没接通。再点一次开始听。");
  }

  function onState(backend: "xai" | "browser", live: boolean) {
    const s = store.getState();
    if (!s.listening) {
      if (s.mic === "live" || s.mic === "arming") s.setMic("idle");
      return;
    }
    if (live) {
      s.setMic("live");
      s.setEngineError(null);
      if (backend === "xai") s.setSttBackend("xai");
      hooks.dispatch("mic_live");
    }
  }

  function clearRetry() {
    if (retry != null) clearTimeout(retry);
    retry = null;
  }

  function dropController() {
    const prev = controller;
    controller = null;
    prev?.stop();
    if (prev) store.getState().setInterim("");
  }

  function wireBrowserSpeech(reason: AiErrorCode | "stt" | null) {
    const s = store.getState();
    s.setSttBackend("browser", browserSpeechNote(reason));
    s.setEngineError(null);
    const me: Backend = deps.makeSpeech({
      onPartial: (t) => {
        if (controller === me) store.getState().setInterim(t);
      },
      onFinal: (t) => {
        if (controller === me) hooks.onFinal(t);
      },
      onError: (code) => {
        if (controller === me) onError(code);
      },
      onState: (live) => {
        if (controller === me) onState("browser", live);
      },
    });
    controller = me;
    me.start();
  }

  /** xAI did not answer: try it once more, then hand the mic to the browser, saying so. */
  function sttFailed() {
    dropController();
    if (!store.getState().listening) return;
    const reason = lastMintFail ?? "stt";
    if (attempts < STT_ATTEMPTS) {
      store.getState().setEngineError("实时听写没接上，再试一次…");
      clearRetry();
      retry = setTimeout(() => {
        retry = null;
        if (store.getState().listening) startStt();
      }, STT_RETRY_MS);
      return;
    }
    if (deps.speechSupported()) {
      wireBrowserSpeech(reason);
      return;
    }
    onError("stt");
  }

  function startStt(stream?: MediaStream) {
    if (!store.getState().listening) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    attempts += 1;
    // A dead controller can report the same failure twice (socket error, then
    // the open timeout); only the controller on the mic may drive the runtime.
    const me: Backend = deps.makeStt(
      {
        onPartial: (t) => {
          if (controller === me) store.getState().setInterim(t);
        },
        onFinal: (t) => {
          if (controller === me) hooks.onFinal(t);
        },
        onError: (code) => {
          if (controller !== me) return;
          if (code === "denied") {
            onError("denied");
            return;
          }
          sttFailed();
        },
        onState: (live) => {
          if (controller === me) onState("xai", live);
        },
      },
      async () => {
        const minted = await api.mintStt();
        if (!minted.ok) {
          lastMintFail = minted.code;
          throw new Error(minted.error);
        }
        lastMintFail = null;
        return minted.token;
      },
    );
    controller = me;
    void me.start(stream);
  }

  return {
    /** Open the mic. The caller has already put the store into the arming state. */
    start() {
      clearRetry();
      dropController();
      attempts = 0;
      lastMintFail = null;
      store.getState().setSttBackend(null);
      if (deps.micSupported()) {
        void deps
          .requestMic()
          .then((stream) => startStt(stream))
          .catch((err) => {
            const code = micErrorCode(err);
            if (code !== "denied" && deps.speechSupported()) {
              wireBrowserSpeech("stt");
              return;
            }
            onError(code);
          });
        return;
      }
      if (deps.speechSupported()) {
        wireBrowserSpeech("stt");
        return;
      }
      const s = store.getState();
      s.setListening(false);
      s.setMic("unsupported");
      s.setEngineError("此浏览器不能听写。请用 Chrome。");
      hooks.dispatch("mic_failed");
    },
    /** Close the mic; captions already heard keep translating. */
    stop() {
      clearRetry();
      dropController();
      store.getState().setSttBackend(null);
    },
    /** Neither backend exists in this browser. */
    unsupported() {
      return !deps.micSupported() && !deps.speechSupported();
    },
    get attempts() {
      return attempts;
    },
  };
}

export type ListenRuntime = ReturnType<typeof createListenRuntime>;
