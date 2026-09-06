import { createFileRoute } from "@tanstack/react-router";
import { MissionShell } from "@/components/capcom/mission-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <MissionShell />;
}
