import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAwake, isInClass, nextPhase, phaseFromCatalog, type ClassPhase } from "./class-machine.ts";

const open = { openClass: true };
const none = { openClass: false };

describe("class machine", () => {
  it("walks the happy path idle → arming → listening → paused → listening → ending → ended", () => {
    let p: ClassPhase | null = "idle";
    p = nextPhase(p, "arm", none);
    assert.equal(p, "arming");
    p = nextPhase(p!, "mic_live", open);
    assert.equal(p, "listening");
    p = nextPhase(p!, "pause", open);
    assert.equal(p, "paused");
    p = nextPhase(p!, "arm", open);
    assert.equal(p, "arming");
    p = nextPhase(p!, "mic_live", open);
    assert.equal(p, "listening");
    p = nextPhase(p!, "end", open);
    assert.equal(p, "ending");
    p = nextPhase(p!, "ended", none);
    assert.equal(p, "ended");
    p = nextPhase(p!, "arm", none);
    assert.equal(p, "arming");
  });

  it("ignores a second arm while arming or listening", () => {
    assert.equal(nextPhase("arming", "arm", none), null);
    assert.equal(nextPhase("listening", "arm", open), null);
  });

  it("ignores a second end while ending or after ended", () => {
    assert.equal(nextPhase("ending", "end", open), null);
    assert.equal(nextPhase("ended", "end", none), null);
    assert.equal(nextPhase("idle", "end", none), null);
  });

  it("a mic failure pauses an open class but idles an empty one", () => {
    assert.equal(nextPhase("arming", "mic_failed", open), "paused");
    assert.equal(nextPhase("arming", "mic_failed", none), "idle");
    assert.equal(nextPhase("listening", "mic_failed", open), "paused");
    assert.equal(nextPhase("paused", "mic_failed", open), null);
  });

  it("mic_live only counts while arming", () => {
    assert.equal(nextPhase("idle", "mic_live", none), null);
    assert.equal(nextPhase("paused", "mic_live", open), null);
    assert.equal(nextPhase("listening", "mic_live", open), null);
  });

  it("reset is allowed everywhere except mid-ending", () => {
    for (const p of ["idle", "arming", "listening", "paused", "ended"] as ClassPhase[]) {
      assert.equal(nextPhase(p, "reset", none), "idle", p);
    }
    assert.equal(nextPhase("ending", "reset", none), null);
  });

  it("names the awake and in-class phases", () => {
    assert.deepEqual(
      (["idle", "arming", "listening", "paused", "ending", "ended"] as ClassPhase[]).map(isAwake),
      [false, true, true, false, false, false],
    );
    assert.deepEqual(
      (["idle", "arming", "listening", "paused", "ending", "ended"] as ClassPhase[]).map(isInClass),
      [false, true, true, true, false, false],
    );
  });

  it("a catalog with an open class restores as paused, unless audio is already flowing", () => {
    assert.equal(phaseFromCatalog("idle", true), "paused");
    assert.equal(phaseFromCatalog("idle", false), "idle");
    assert.equal(phaseFromCatalog("listening", true), "listening");
    assert.equal(phaseFromCatalog("arming", false), "arming");
    assert.equal(phaseFromCatalog("paused", false), "idle");
    assert.equal(phaseFromCatalog("ended", false), "ended");
  });
});
