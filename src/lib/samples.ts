import { SAMPLE_ID, sampleSession } from "./recap-demo.ts";
import { SPACEX_ID, spacexSession } from "./recap-spacex.ts";
import type { ClassSession } from "./types.ts";

/**
 * Two finished handouts shipped with the app so a first visit can see what a
 * class turns into. They are read-only pages at `/class/<id>`; they are never
 * written into the student's catalog and never leave this device.
 */
const SAMPLES: { id: string; build: () => ClassSession }[] = [
  { id: SPACEX_ID, build: spacexSession },
  { id: SAMPLE_ID, build: sampleSession },
];

export function isSampleId(id: string) {
  return SAMPLES.some((s) => s.id === id);
}

export function sampleById(id: string): ClassSession | null {
  const hit = SAMPLES.find((s) => s.id === id);
  return hit ? hit.build() : null;
}

/** For the empty catalog: what to open first. */
export function sampleList(): Pick<ClassSession, "id" | "title" | "classMode">[] {
  return SAMPLES.map((s) => {
    const built = s.build();
    return { id: built.id, title: built.title, classMode: built.classMode };
  });
}
