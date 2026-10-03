import { isUnauthorizedError } from "@opencode/client";

// Location-scoped endpoints take `?location[directory]=<abs path>`. Pass
// undefined when there is no directory so the server default applies.
export function locationInput(directory?: string) {
  if (!directory) {
    return undefined;
  }

  return { location: { directory } };
}

// v2 projects carry `canonical` where v1 had `worktree`. Every
// directory-grouping path must go through here.
export function projectWorktree(project: { canonical: string }): string {
  return project.canonical;
}

// v2 sessions carry `location: { directory }` instead of a top-level
// `directory` field. Every grouping/display path must go through here so
// no new spelling variant is introduced (see normalizeDirectory).
export function sessionDirectoryOf(session: {
  location?: { directory?: string };
}): string {
  return session.location?.directory || "";
}

// The v2 client throws declared errors instead of returning
// `{ data, error }`. Anything auth-shaped means the pairing is dead:
// re-pair, do not retry.
export function isAuthError(error: unknown): boolean {
  try {
    if (isUnauthorizedError(error)) {
      return true;
    }
  } catch {
    // Fall through to the message checks below.
  }

  const message = error instanceof Error ? error.message : String(error);

  return message.includes("401") || message.includes("Unauthorized");
}
