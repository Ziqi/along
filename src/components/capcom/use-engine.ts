import { useEffect } from "react";
import { engine } from "@/lib/engine";

/**
 * Mounts nothing of the engine itself — it runs on its own — but makes sure
 * its heartbeat is started once the app is on screen.
 */
export function useCapcomEngine() {
  useEffect(() => {
    engine.start();
  }, []);
}
