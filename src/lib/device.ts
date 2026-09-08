export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function preferBrowserSpeech() {
  return isIOS();
}

const DEVICE_KEY = "along.device";
let memo: string | null = null;

/**
 * A random id for this browser, made once and kept in localStorage. It names
 * the caller for the AI rate limits when nobody is signed in: a whole classroom
 * shares one IP, so IP alone would make thirty students one caller.
 */
export function deviceId(): string {
  if (memo) return memo;
  if (typeof window === "undefined") return "";
  try {
    const hit = window.localStorage.getItem(DEVICE_KEY);
    if (hit && /^[A-Za-z0-9_-]{8,40}$/.test(hit)) {
      memo = hit;
      return hit;
    }
    const fresh = randomId();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    memo = fresh;
    return fresh;
  } catch {
    memo = memo ?? randomId();
    return memo;
  }
}

function randomId() {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
