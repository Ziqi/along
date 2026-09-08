import { createFileRoute } from "@tanstack/react-router";
import { Classroom } from "@/components/capcom/classroom";

/** `/` — the classroom: captions on the left, coach on the right. */
export const Route = createFileRoute("/_shell/")({ component: Classroom });
