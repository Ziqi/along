import type { Jot } from "../types.ts";
import type { EngineContext } from "./context.ts";

/**
 * 记要点: a line typed or kept from a card goes into the open class at once
 * and gets its other half translated in the background. The translation
 * always lands (it is the student's own line); only the outline redraw is
 * skipped when the class ended in between.
 */
export function createNoteRuntime(ctx: EngineContext, hooks: { onNote: () => void }) {
  const { store, api } = ctx;
  let gen = 0;

  /** `targetId` pins the note to one class (the handout page); otherwise it goes to the open class. */
  async function capture(raw: string, src: Jot["src"], pair?: { en?: string; zh?: string }, targetId?: string) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text && !pair?.en && !pair?.zh) return;
    const isZh = /[\u4e00-\u9fff]/.test(pair?.zh || text);
    const draft = {
      src,
      en: pair?.en || (isZh ? "" : text),
      zh: pair?.zh || (isZh ? text : ""),
    };
    const id = store.getState().addJot(draft, targetId);
    if (!id) return;
    const mine = gen;
    store.getState().ping("已记入纪要");
    if (draft.en && draft.zh) {
      store.getState().patchJot(id, { en: draft.en, zh: draft.zh, pending: false });
      if (mine === gen) hooks.onNote();
      return;
    }
    let result: Awaited<ReturnType<typeof api.quick>>;
    try {
      result = await api.quick({ data: { text: draft.en || draft.zh } });
    } catch {
      store.getState().patchJot(id, { pending: false });
      return;
    }
    if (!result.ok) {
      store.getState().patchJot(id, { pending: false });
      return;
    }
    if (result.dir === "zh-en") {
      store.getState().patchJot(id, { zh: draft.zh || text, en: result.out, pending: false });
    } else {
      store.getState().patchJot(id, { en: draft.en || text, zh: result.out, pending: false });
    }
    if (mine === gen) hooks.onNote();
  }

  return {
    capture,
    /** End of class: notes still translate, but no longer redraw a closed outline. */
    abort() {
      gen += 1;
    },
  };
}

export type NoteRuntime = ReturnType<typeof createNoteRuntime>;
