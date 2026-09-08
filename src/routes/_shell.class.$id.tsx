import { createFileRoute } from "@tanstack/react-router";
import { RecapPage } from "@/components/capcom/recap-page";
import { parseHandoutSearch } from "@/lib/nav";

/** `/class/:id` — one handout. `?catalog` opens the drawer on a phone, `?edit` turns the paper editable. */
export const Route = createFileRoute("/_shell/class/$id")({
  validateSearch: parseHandoutSearch,
  component: HandoutRoute,
});

function HandoutRoute() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return (
    <RecapPage mode="read" sessionId={id} catalog={Boolean(search.catalog)} editing={Boolean(search.edit)} />
  );
}
