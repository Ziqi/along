import { createFileRoute } from "@tanstack/react-router";
import { RecapPage } from "@/components/capcom/recap-page";

/** `/class` — the catalog with no handout picked. */
export const Route = createFileRoute("/_shell/class/")({
  component: () => <RecapPage mode="read" sessionId={null} catalog={false} editing={false} />,
});
