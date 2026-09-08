import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MissionShell } from "@/components/capcom/mission-shell";

/**
 * The app frame for `/`, `/class`, `/class/:id` and `/review`: one top bar,
 * one engine, one keyboard handler. Only the middle changes with the URL, so a
 * class keeps being heard while the student reads an old handout.
 */
export const Route = createFileRoute("/_shell")({
  component: () => (
    <MissionShell>
      <Outlet />
    </MissionShell>
  ),
});
