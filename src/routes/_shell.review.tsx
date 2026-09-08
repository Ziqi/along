import { createFileRoute } from "@tanstack/react-router";
import { RecapPage } from "@/components/capcom/recap-page";
import { parseReviewSearch } from "@/lib/nav";

/** `/review` — the drill deck. `?class=` drills one class; without it, every class. */
export const Route = createFileRoute("/_shell/review")({
  validateSearch: parseReviewSearch,
  component: ReviewRoute,
});

function ReviewRoute() {
  const search = Route.useSearch();
  return (
    <RecapPage mode="drill" sessionId={search.class ?? null} catalog={Boolean(search.catalog)} editing={false} />
  );
}
