export type SpeechHandlers = {
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

/** A pause this long mid-utterance puts the words heard so far on screen. */
export const SOFT_FINAL_MS = 1100;

function bestText(piece: RecogEvent["results"][number]) {
  let best = "";
  const n = Math.min(piece.length || 1, 3);
  for (let i = 0; i < n; i++) {
    const t = (piece[i]?.transcript ?? "").trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

/**
 * The part of `text` that has not been shown yet, given `committed` was
 * already emitted for the same utterance. The browser recognizer's interim
 * results are cumulative — "M Taylor", "M Taylor Swift", "M Taylor Swift is
 * huge" — so once a soft final has put the first words on screen, every later
 * result must contribute only its tail, or the same words appear line after
 * line. The recognizer may also revise words it already gave us; those stay
 * as shown (no retraction), and only what comes after them goes out. A result
 * that shares almost nothing with what was committed is a new utterance and
 * goes out whole.
 */
export function unsaidTail(committed: string, text: string): string {
  const done = wordsOf(committed);
  if (!done.length) return text.trim();
  const words = text.trim().split(/\s+/).filter(Boolean);
  const norm = words.map((w) => wordsOf(w)[0] ?? "");
  // Anchor on the last committed words: the recognizer may have inserted or
  // dropped a word earlier in the utterance, so look around the expected spot.
  for (let k = Math.min(3, done.length); k >= 1; k -= 1) {
    const anchor = done.slice(-k);
    const expected = done.length - k;
    const from = Math.max(0, expected - 3);
    const to = Math.min(norm.length - k, expected + 3);
    for (let start = from; start <= to; start += 1) {
      if (anchor.every((w, i) => norm[start + i] === w)) {
        return words.slice(start + k).join(" ").trim();
      }
    }
  }
  const overlap = Math.min(done.length, norm.length);
  let same = 0;
  for (let i = 0; i < overlap; i += 1) if (norm[i] === done[i]) same += 1;
  if (same * 2 < overlap) return text.trim();
  return words.slice(done.length).join(" ").trim();
}

export class SpeechController {
  private rec: Recog | null = null;
  private wanted = false;
  private booting = false;
  private handlers: SpeechHandlers;
  private lang: string;
  private softTimer: number | null = null;
  private lastInterim = "";
  /** Words of the current utterance already sent as a soft final. */
  private committed = "";

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

  /** Send what the current utterance has said beyond what is already on screen. */
  private emit(text: string, minLength: number) {
    const piece = unsaidTail(this.committed, text);
    if (piece.length >= minLength) {
      this.handlers.onFinal(piece);
      this.committed = text.trim();
    }
  }

  private flushInterim() {
    this.clearSoft();
    const piece = this.lastInterim.trim();
    this.lastInterim = "";
    if (piece) this.emit(piece, 3);
    this.committed = "";
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
        // The utterance is closed: say its tail, then start the next one clean.
        this.emit(finalText, 3);
        this.committed = "";
      }
      const inter = interim.trim();
      this.lastInterim = inter;
      this.handlers.onPartial(unsaidTail(this.committed, inter));
      if (unsaidTail(this.committed, inter).length >= 8) {
        if (this.softTimer != null) window.clearTimeout(this.softTimer);
        this.softTimer = window.setTimeout(() => {
          const piece = this.lastInterim.trim();
          this.softTimer = null;
          // A quiet second mid-utterance: put the new words on screen now, but
          // remember them, so the utterance's final does not print them again.
          if (piece) this.emit(piece, 8);
        }, SOFT_FINAL_MS);
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
