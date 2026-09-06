type SpeechHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
  onState: (live: boolean) => void;
};

type Recog = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: RecogEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type RecogEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    length: number;
    [i: number]: { transcript: string };
  }>;
};

function getCtor(): (new () => Recog) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported() {
  return getCtor() !== null;
}

function bestText(piece: RecogEvent["results"][number]) {
  let best = "";
  const n = Math.min(piece.length || 1, 3);
  for (let i = 0; i < n; i++) {
    const t = (piece[i]?.transcript ?? "").trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

export class SpeechController {
  private rec: Recog | null = null;
  private wanted = false;
  private booting = false;
  private handlers: SpeechHandlers;
  private lang: string;
  private softTimer: number | null = null;
  private lastInterim = "";

  constructor(handlers: SpeechHandlers, lang = "en-US") {
    this.handlers = handlers;
    this.lang = lang;
  }

  setLang(lang: string) {
    this.lang = lang;
  }

  start() {
    const Ctor = getCtor();
    if (!Ctor) {
      this.handlers.onError("unsupported");
      return;
    }
    this.wanted = true;
    this.boot(Ctor);
  }

  stop() {
    this.wanted = false;
    this.flushInterim();
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    this.rec = null;
    this.handlers.onPartial("");
    this.handlers.onState(false);
  }

  private clearSoft() {
    if (this.softTimer != null) {
      window.clearTimeout(this.softTimer);
      this.softTimer = null;
    }
  }

  private flushInterim() {
    this.clearSoft();
    const piece = this.lastInterim.trim();
    this.lastInterim = "";
    if (piece.length >= 3) this.handlers.onFinal(piece);
    this.handlers.onPartial("");
  }

  private boot(Ctor: new () => Recog) {
    if (!this.wanted || this.booting) return;
    this.booting = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.maxAlternatives = 3;
    rec.onresult = (ev) => {
      let interim = "";
      let finals = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i];
        const t = bestText(piece);
        if (piece.isFinal) finals += (finals ? " " : "") + t;
        else interim += (interim ? " " : "") + t;
      }
      const finalText = finals.trim();
      if (finalText) {
        this.clearSoft();
        this.lastInterim = "";
        this.handlers.onFinal(finalText);
      }
      const inter = interim.trim();
      this.lastInterim = inter;
      this.handlers.onPartial(inter);
      if (inter.length >= 8) {
        if (this.softTimer != null) window.clearTimeout(this.softTimer);
        this.softTimer = window.setTimeout(() => {
          const piece = this.lastInterim.trim();
          this.lastInterim = "";
          this.softTimer = null;
          if (piece.length >= 8) this.handlers.onFinal(piece);
        }, 1100);
      }
    };
    rec.onerror = (ev) => {
      const code = ev.error ?? "error";
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        this.wanted = false;
        this.clearSoft();
        this.handlers.onError("denied");
        this.handlers.onState(false);
        return;
      }
      this.handlers.onError(code);
    };
    rec.onend = () => {
      this.booting = false;
      if (this.rec === rec) this.rec = null;
      this.flushInterim();
      if (!this.wanted) {
        this.handlers.onState(false);
        return;
      }
      window.setTimeout(() => {
        if (this.wanted) this.boot(Ctor);
      }, 280);
    };
    this.rec = rec;
    try {
      rec.start();
      this.booting = false;
      this.handlers.onState(true);
    } catch (err) {
      this.booting = false;
      this.rec = null;
      const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.wanted = false;
        this.handlers.onError("denied");
        this.handlers.onState(false);
        return;
      }
      window.setTimeout(() => {
        if (this.wanted) this.boot(Ctor);
      }, 160);
    }
  }
}
