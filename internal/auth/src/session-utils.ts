/**
 * Better Auth marks anonymous sessions with `session.user.isAnonymous = true`
 * (see the `anonymous()` plugin wiring in `./server.ts`). Callers have been
 * casting inline across the codebase; this helper centralises the shape
 * assertion so a future Better Auth field rename fails in one place instead
 * of silently treating anonymous users as authenticated.
 */
export function isSessionAnonymous(session: { user: unknown }): boolean {
  const user = session.user;
  if (typeof user !== "object" || user === null) {
    return false;
  }
  const flag = (user as { isAnonymous?: unknown }).isAnonymous;
  return flag === true;
}
