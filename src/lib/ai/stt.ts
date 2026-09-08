import { createServerFn } from "@tanstack/react-start";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { XAI_REALTIME_SECRETS_URL, xaiKey } from "./llm/models";
import { logAi } from "./llm/transport";

/** 30-minute client secret so the browser streams speech to xAI directly. */
export const mintSttSecret = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .handler(async ({ context }): Promise<{ ok: true; token: string } | AiFail> => {
    const gate = takeAiToken(context.caller, "stt");
    if (!gate.ok) return aiFail("rate_limited");
    if (!xaiKey()) return aiFail("unavailable");
    const started = Date.now();
    // Bounded and never throwing: the client treats a rejection as a network
    // error and a network error as "try the browser's recognizer".
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(XAI_REALTIME_SECRETS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${xaiKey()}`,
        },
        body: JSON.stringify({ expires_after: { seconds: 1800 } }),
        signal: ac.signal,
      });
      logAi({ tag: "stt.secret", model: "realtime", ms: Date.now() - started, ok: res.ok, status: res.status });
      if (!res.ok) return aiFail("upstream", res.status);
      const body = (await res.json().catch(() => null)) as { value?: string } | null;
      if (!body?.value) return aiFail("no_stt_secret");
      return { ok: true, token: body.value };
    } catch {
      logAi({ tag: "stt.secret", model: "realtime", ms: Date.now() - started, ok: false, reason: "timeout" });
      return aiFail("timeout");
    } finally {
      clearTimeout(timer);
    }
  });
