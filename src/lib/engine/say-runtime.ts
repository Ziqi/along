import type { EngineContext } from "./context.ts";

export type SayResult = { ok: true; id: string; en: string; zh: string } | { ok: false; error: string };

/**
 * 「我想说」: the student types what they mean in 中文 and gets one line they
 * can say in this class, in the register of what was just heard. The line is
 * kept as a note of its own kind (`say`), so the handout shows what the
 * student wanted to say beside what the coach offered. A failed ask leaves
 * nothing behind; the text stays in the box to try again.
 */
export function createSayRuntime(ctx: EngineContext, hooks: { onNote: () => void }) {
  const { store, api } = ctx;
  let gen = 0;
  let busy = false;

  async function ask(raw: string): Promise<SayResult> {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return { ok: false, error: "先写一句中文。" };
    if (busy) return { ok: false, error: "上一句还在写。" };
    const s = store.getState();
    const id = s.addJot({ src: "say", zh: text, en: "" });
    if (!id) return { ok: false, error: "先开一堂课，再说。" };
    busy = true;
    const mine = gen;
    const recent = s.captions.slice(-6).map((c) => c.en).filter(Boolean);
    try {
      const result = await api.say({ data: { text, recent } });
      if (!result.ok) {
        store.getState().removeJot(id);
        return { ok: false, error: sayError(result.code, result.error) };
      }
      store.getState().patchJot(id, { en: result.en, zh: result.zh || text, pending: false });
      if (mine === gen) hooks.onNote();
      return { ok: true, id, en: result.en, zh: result.zh || text };
    } catch {
      store.getState().removeJot(id);
      return { ok: false, error: "网络没通，再试一次。" };
    } finally {
      busy = false;
    }
  }

  return {
    ask,
    get busy() {
      return busy;
    },
    /** End of class: a late answer still lands as a note, but no longer redraws the outline. */
    abort() {
      gen += 1;
    },
  };
}

function sayError(code: string, fallback: string) {
  switch (code) {
    case "rate_limited":
      return "太频繁了，稍等一下。";
    case "timeout":
      return "这句想久了，再试一次。";
    case "empty":
      return "没写出来，换个说法再试。";
    case "unavailable":
      return "AI 暂不可用。";
    default:
      return fallback || "没写出来，再试一次。";
  }
}

export type SayRuntime = ReturnType<typeof createSayRuntime>;
