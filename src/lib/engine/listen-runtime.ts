import { SpeechController, speechSupported } from "../speech-controller.ts";
import { micErrorCode, micSupported, requestMic, SttController } from "../stt-controller.ts";
import type { ClassEvent } from "./class-machine.ts";
import type { EngineContext } from "./context.ts";

type Hooks = {
  onFinal: (text: string) => void;
  /** Report a machine event; returns false when the machine refused it. */
  dispatch: (event: ClassEvent) => boolean;
};

const framed = () => {
  try {
    return typeof window !== "undefined" && window.top !== window;
  } catch {
    return true;
  }
};

/**
 * Owns the speech backend: xAI STT over the mic when available, the browser's
 * own recognizer as the fallback. Everything it hears goes to `onFinal`; every
 * state change goes through the class machine.
 */
export function createListenRuntime(ctx: EngineContext, hooks: Hooks) {
  const { store, api } = ctx;
  let controller: SpeechController | SttController | null = null;

  function onError(code: string) {
    const s = store.getState();
    s.setListening(false);
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

  function onState(live: boolean) {
    const s = store.getState();
    if (!s.listening) {
      if (s.mic === "live" || s.mic === "arming") s.setMic("idle");
      return;
    }
    if (live) {
      s.setMic("live");
      s.setEngineError(null);
      hooks.dispatch("mic_live");
    }
  }

  function dropController() {
    const prev = controller;
    controller = null;
    prev?.stop();
  }

  function wireBrowserSpeech() {
    controller = new SpeechController({
      onPartial: (t) => store.getState().setInterim(t),
      onFinal: hooks.onFinal,
      onError,
      onState,
    });
    controller.start();
  }

  function startStt(stream?: MediaStream) {
    if (!store.getState().listening) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    controller = new SttController(
      {
        onPartial: (t) => store.getState().setInterim(t),
        onFinal: hooks.onFinal,
        onError: (code) => {
          if (code === "denied") {
            onError("denied");
            return;
          }
          if (speechSupported()) {
            dropController();
            store.getState().setEngineError("改用浏览器听写。");
            wireBrowserSpeech();
            return;
          }
          onError(code);
        },
        onState,
      },
      async () => {
        const minted = await api.mintStt();
        if (!minted.ok) throw new Error(minted.error);
        return minted.token;
      },
    );
    void controller.start(stream);
  }

  return {
    /** Open the mic. The caller has already put the store into the arming state. */
    start() {
      dropController();
      if (micSupported()) {
        void requestMic()
          .then((stream) => startStt(stream))
          .catch((err) => {
            const code = micErrorCode(err);
            if (code !== "denied" && speechSupported()) {
              store.getState().setEngineError("改用浏览器听写。");
              wireBrowserSpeech();
              return;
            }
            onError(code);
          });
        return;
      }
      if (speechSupported()) {
        wireBrowserSpeech();
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
      dropController();
    },
    /** Neither backend exists in this browser. */
    unsupported() {
      return !micSupported() && !speechSupported();
    },
  };
}

export type ListenRuntime = ReturnType<typeof createListenRuntime>;
