import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasZh,
  keepLatestByCaptionOrder,
  mergeTranslateQueue,
  needsTranslate,
  withDeadline,
} from "./live-queue.ts";

describe("live translate queue", () => {
  it("chases the newest captions and drops the old backlog", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const batch = ids.map((id) => ({ id, en: id }));
    const kept = keepLatestByCaptionOrder(batch, ids, 8);
    assert.deepEqual(
      kept.map((x) => x.id),
      ["c", "d", "e", "f", "g", "h", "i", "j"],
    );
  });

  it("keeps one row per id and prefers the later English", () => {
    const ids = ["a", "b"];
    const kept = mergeTranslateQueue(
      [
        { id: "a", en: "old a" },
        { id: "b", en: "old b" },
      ],
      [{ id: "a", en: "new a" }],
      ids,
      8,
    );
    assert.equal(kept.find((x) => x.id === "a")?.en, "new a");
    assert.equal(kept.length, 2);
  });

  it("needsTranslate skips already-Chinese lines and glue", () => {
    assert.equal(needsTranslate({ en: "Wait times are longer.", zh: "" }), true);
    assert.equal(needsTranslate({ en: "Wait times are longer.", zh: "等候更久。" }), false);
    assert.equal(needsTranslate({ en: "ok", zh: "" }), false);
  });

  it("hasZh requires a real Chinese character", () => {
    assert.equal(hasZh("translating…"), false);
    assert.equal(hasZh("等候更久"), true);
  });

  it("withDeadline rejects a hung promise", async () => {
    await assert.rejects(
      withDeadline(new Promise(() => {}), 20),
      /deadline/,
    );
  });
});
