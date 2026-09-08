import { createMiddleware } from "@tanstack/react-start";

/**
 * Guard for every AI server function (dual client/server, like `authMiddleware`).
 *
 * - client: forward the live-preview bearer token so a signed-in student is
 *   identified even inside the partitioned preview iframe, and this browser's
 *   device id so a signed-out student is still one caller, not one IP.
 * - server: reject scripted cross-site / sibling-tenant requests, then resolve
 *   the caller (user id, else device id, else IP) into `context.caller`.
 *   Handlers call `takeAiToken(context.caller, kind)` first and return its
 *   refusal as the normal `{ ok: false }` shape, so the client keeps one error
 *   path.
 *
 * Only `*.server` modules may be imported inside `.server()`; this file ships
 * to the browser.
 */
export const aiGuard = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const [{ getBearerToken }, { deviceId }] = await Promise.all([
      import("@/lib/auth/client"),
      import("@/lib/device"),
    ]);
    return next({
      sendContext: { bearerToken: getBearerToken() ?? undefined, deviceId: deviceId() || undefined },
    });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { resolveAiCaller } = await import("./guard.server");
    assertSameSiteRequest();
    const caller = await resolveAiCaller(context.bearerToken, context.deviceId);
    return next({ context: { caller } });
  });
