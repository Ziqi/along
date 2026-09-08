export type SttHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
  onState: (live: boolean) => void;
};

type SttEvent = {
  type?: string;
  text?: string;
  is_final?: boolean;
  speech_final?: boolean;
};

export function micSupported() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function micErrorCode(err: unknown): "denied" | "stt" {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    /not allowed|permission/i.test(msg)
  ) {
    return "denied";
  }
  return "stt";
}

export function requestMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function pcm16From(float32: Float32Array, inRate: number) {
  const outRate = 16000;
  const ratio = inRate / outRate;
  const n = Math.max(1, Math.floor(float32.length / ratio));
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = float32[Math.min(float32.length - 1, Math.floor(i * ratio))] ?? 0;
    const c = Math.max(-1, Math.min(1, s));
    pcm[i] = c < 0 ? c * 0x8000 : c * 0x7fff;
  }
  return pcm;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class SttController {
  private wanted = false;
  private handlers: SttHandlers;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private ws: WebSocket | null = null;
  private proc: ScriptProcessorNode | null = null;
  private ready = false;
  private connecting = false;
  private mint: () => Promise<string>;
  private onVis = () => {
    if (typeof document === "undefined" || document.hidden || !this.wanted) return;
    if (this.ws?.readyState === WebSocket.OPEN && this.ready) return;
    void this.connect().catch(() => this.handlers.onError("stt"));
  };

  constructor(handlers: SttHandlers, mint: () => Promise<string>) {
    this.handlers = handlers;
    this.mint = mint;
  }

  async start(stream?: MediaStream) {
    this.wanted = true;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVis);
      document.addEventListener("visibilitychange", this.onVis);
    }
    try {
      this.stream =
        stream ??
        (await Promise.race([
          requestMic(),
          sleep(12000).then(() => {
            throw new Error("mic-timeout");
          }),
        ]));
    } catch (err) {
      this.wanted = false;
      const code = err instanceof Error && err.message === "mic-timeout" ? "stt" : micErrorCode(err);
      this.handlers.onError(code);
      this.handlers.onState(false);
      return;
    }
    if (!this.wanted) {
      this.tearDown();
      return;
    }
    try {
      await this.connect();
    } catch {
      if (this.wanted) this.handlers.onError("stt");
      this.tearDown();
    }
  }

  stop() {
    this.wanted = false;
    this.tearDown();
    this.handlers.onPartial("");
    this.handlers.onState(false);
  }

  private async connect() {
    if (this.connecting) return;
    this.connecting = true;
    try {
    const token = await Promise.race([
      this.mint(),
      sleep(8000).then(() => {
        throw new Error("mint-timeout");
      }),
    ]);
    if (!this.wanted) return;
    const qs =
      "sample_rate=16000&encoding=pcm&interim_results=true&language=en&format=true&smart_turn=0.42&smart_turn_timeout=1400&endpointing=420";
    const ws = new WebSocket(`wss://api.x.ai/v1/stt?${qs}`, [
      `xai-client-secret.${token}`,
    ]);
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    const opened = new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("ws-timeout")), 8000);
      ws.onopen = () => {
        window.clearTimeout(t);
        resolve();
      };
      ws.addEventListener("error", () => {
        window.clearTimeout(t);
        reject(new Error("ws-error"));
      });
    });
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: SttEvent;
      try {
        msg = JSON.parse(ev.data) as SttEvent;
      } catch {
        return;
      }
      if (msg.type === "transcript.created") {
        this.ready = true;
        this.handlers.onState(true);
        return;
      }
      if (msg.type === "error") {
        this.handlers.onError("stt");
        return;
      }
      if (msg.type !== "transcript.partial") return;
      if (!this.wanted) return;
      const text = (msg.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const letters = text.match(/[a-zA-Z\u4e00-\u9fff]/g)?.length ?? 0;
      if (letters < 3 || /^[?？!！.。,，\-…\s]+$/.test(text)) return;
      if (msg.is_final || msg.speech_final) {
        this.handlers.onPartial("");
        this.handlers.onFinal(text);
      } else {
        this.handlers.onPartial(text);
      }
    };
    ws.onerror = () => {
      if (this.wanted) this.handlers.onError("stt");
    };
    ws.onclose = () => {
      this.ready = false;
      if (!this.wanted) return;
      if (typeof document !== "undefined" && document.hidden) return;
      window.setTimeout(() => {
        if (this.wanted && !document.hidden) {
          void this.connect().catch(() => this.handlers.onError("stt"));
        }
      }, 800);
    };
    await opened;
    if (!this.wanted) return;
    await this.armMic();
    window.setTimeout(() => {
      if (this.wanted && !this.ready) this.handlers.onError("stt");
    }, 6000);
    } finally {
      this.connecting = false;
    }
  }

  private async armMic() {
    if (this.ctx || !this.stream) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error("no-audio");
    const ctx = new AC();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(this.stream);
    const proc = ctx.createScriptProcessor(1024, 1, 1);
    this.proc = proc;
    proc.onaudioprocess = (ev) => {
      if (!this.wanted || !this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
      const pcm = pcm16From(ev.inputBuffer.getChannelData(0), ctx.sampleRate);
      const copy = new Int16Array(pcm.length);
      copy.set(pcm);
      this.ws.send(copy.buffer);
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
  }

  private tearDown() {
    this.ready = false;
    this.connecting = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVis);
    }
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "audio.done" }));
      }
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    try {
      this.proc?.disconnect();
    } catch {
      /* ignore */
    }
    this.proc = null;
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
