/**
 * The class as an explicit state machine.
 *
 *   idle → arming → listening ⇄ paused → ending → ended → (arm) arming
 *
 * The engine is the only writer; the store mirrors `phase` so the UI can read
 * it. Pure: every transition is a table lookup, so double clicks (arm while
 * arming, end while ending) fall out as `null` and are ignored.
 */
export type ClassPhase = "idle" | "arming" | "listening" | "paused" | "ending" | "ended";

export type ClassEvent =
  /** 开始听 / 继续听 pressed. */
  | "arm"
  /** The speech backend reported a live connection. */
  | "mic_live"
  /** Mic denied, unsupported, or the connection dropped for good. */
  | "mic_failed"
  /** 暂停 pressed. */
  | "pause"
  /** 结课 pressed. */
  | "end"
  /** The open class has been closed and stashed. */
  | "ended"
  /** Back to the home screen with nothing open. */
  | "reset";

export type ClassContext = {
  /** Whether a not-yet-ended class exists for this device. */
  openClass: boolean;
};

const AWAKE: ReadonlySet<ClassPhase> = new Set(["arming", "listening"]);
const ENDABLE: ReadonlySet<ClassPhase> = new Set(["arming", "listening", "paused"]);

/** The phase after `event`, or `null` when the event is not allowed in `phase`. */
export function nextPhase(phase: ClassPhase, event: ClassEvent, ctx: ClassContext): ClassPhase | null {
  switch (event) {
    case "arm":
      return phase === "idle" || phase === "paused" || phase === "ended" ? "arming" : null;
    case "mic_live":
      return phase === "arming" ? "listening" : null;
    case "mic_failed":
    case "pause":
      return AWAKE.has(phase) ? (ctx.openClass ? "paused" : "idle") : null;
    case "end":
      return ENDABLE.has(phase) ? "ending" : null;
    case "ended":
      return phase === "ending" ? "ended" : null;
    case "reset":
      return phase === "ending" ? null : "idle";
  }
}

/** True while audio should be flowing: the student expects captions. */
export function isAwake(phase: ClassPhase) {
  return AWAKE.has(phase);
}

/** True while a class is open on this device, heard or paused. */
export function isInClass(phase: ClassPhase) {
  return ENDABLE.has(phase);
}

/**
 * The phase a catalog restored from disk implies. A class that was open when
 * the tab closed comes back paused; nothing open means idle. Phases that
 * describe live audio are kept, because the mic does not survive a reload
 * but a running session in this tab does.
 */
export function phaseFromCatalog(current: ClassPhase, openClass: boolean): ClassPhase {
  if (AWAKE.has(current)) return current;
  if (openClass) return "paused";
  return current === "ended" ? "ended" : "idle";
}
