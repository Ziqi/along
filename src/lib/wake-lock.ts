/**
 * Keep the screen on while a class is being heard. A phone that dims and
 * locks mid-lecture stops the mic and the WebSocket with it; the Screen Wake
 * Lock API asks the browser not to. The lock is dropped by the browser
 * whenever the tab is hidden, so it is re-requested on every return to the
 * foreground for as long as `on()` is in force. A no-op where unsupported.
 */
export type WakeLock = { on(): void; off(): void; readonly held: boolean };

type Sentinel = { release(): Promise<void>; addEventListener(type: "release", fn: () => void): void };
type Nav = { wakeLock?: { request(type: "screen"): Promise<Sentinel> } };

export function createWakeLock(
  env: { navigator?: Nav; document?: Document } = {
    navigator: typeof navigator === "undefined" ? undefined : (navigator as unknown as Nav),
    document: typeof document === "undefined" ? undefined : document,
  },
): WakeLock {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let requesting = false;

  async function acquire() {
    const api = env.navigator?.wakeLock;
    if (!wanted || sentinel || requesting || !api) return;
    if (env.document && env.document.visibilityState !== "visible") return;
    requesting = true;
    try {
      const s = await api.request("screen");
      if (!wanted) {
        void s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
      });
    } catch {
      sentinel = null;
    } finally {
      requesting = false;
    }
  }

  function onVisible() {
    if (env.document?.visibilityState === "visible") void acquire();
  }

  return {
    on() {
      if (wanted) return;
      wanted = true;
      env.document?.addEventListener("visibilitychange", onVisible);
      void acquire();
    },
    off() {
      if (!wanted) return;
      wanted = false;
      env.document?.removeEventListener("visibilitychange", onVisible);
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    },
    get held() {
      return sentinel !== null;
    },
  };
}
