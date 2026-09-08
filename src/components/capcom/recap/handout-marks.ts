import { useMemo } from "react";
import type { ClassRecap } from "@/lib/types";

/** The words the paper underlines: the model's marks, else the longest study terms. */
export function useHandoutMarks(recap: ClassRecap | null) {
  return useMemo(() => {
    const fromAi = recap?.marks ?? [];
    if (fromAi.length) {
      return [...new Set(fromAi.filter((t) => t && t.length >= 3 && t.split(/\s+/).length <= 4))].sort(
        (a, b) => b.length - a.length,
      );
    }
    const raw = [...(recap?.words ?? []), ...(recap?.collos ?? [])].map((x) => x.en);
    return [...new Set(raw.filter((t) => t && t.length >= 4 && t.split(/\s+/).length <= 4))]
      .sort((a, b) => b.length - a.length)
      .slice(0, 24);
  }, [recap?.marks, recap?.words, recap?.collos]);
}
