type SpeechHandlers = {
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

export class SttController {
  private wanted = false;
  private handlers: SpeechHandlers;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private ws: WebSocket | null = null;
  private proc: ScriptProcessorNode | null = null;
  private ready = false;
  private mint: () => Promise<string>;

  constructor(handlers: SpeechHandlers, mint: () => Promise<string>) {
    this.handlers = handlers;
    this.mint = mint;
  }

  async start() {
    this.wanted = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      this.wanted = false;
      this.handlers.onError("denied");
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
      this.handlers.onError("stt");
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
    const token = await this.mint();
    if (!this.wanted) return;
    const qs =
      "sample_rate=16000&encoding=pcm&interim_results=true&language=en&smart_turn=0.65&smart_turn_timeout=2500&endpointing=450";
    const ws = new WebSocket(`wss://api.x.ai/v1/stt?${qs}`, [
      `xai-client-secret.${token}`,
    ]);
    this.ws = ws;
    ws.binaryType = "arraybuffer";
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
      const text = (msg.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (msg.is_final) {
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
      window.setTimeout(() => {
        if (this.wanted) void this.connect().catch(() => this.handlers.onError("stt"));
      }, 400);
    };
    await this.armMic();
  }

  private async armMic() {
    if (this.ctx || !this.stream) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(this.stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    this.proc = proc;
    proc.onaudioprocess = (ev) => {
      if (!this.wanted || !this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
      const pcm = pcm16From(ev.inputBuffer.getChannelData(0), ctx.sampleRate);
      this.ws.send(pcm.buffer);
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
  }

  private tearDown() {
    this.ready = false;
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
