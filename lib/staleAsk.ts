import type { QueryClient } from "@tanstack/react-query";

interface CachedMessageInfo {
  id: string;
  role: string;
  finish?: string | null;
  time: { created: number };
}

interface CachedMessage {
  info: CachedMessageInfo;
}

// An approval/question request is stale when the run that produced it is
// already over: the newest message is a terminal assistant message from a
// DIFFERENT message than the tool call. The server keeps such orphans in
// the queue (desktop TUI stops showing them once the run ends), so the
// phone must detect and retire them instead of blocking the UI forever.
export function isAskStale(
  queryClient: QueryClient,
  serverUrl: string,
  sessionID: string,
  callMessageID: string | undefined,
): boolean {
  if (!callMessageID) {
    return false;
  }

  const all =
    queryClient.getQueryData<CachedMessage[]>([
      "server",
      serverUrl,
      "session",
      sessionID,
      "messages",
    ]) ?? [];

  if (all.length === 0) {
    return false;
  }

  let last = all[0] as CachedMessage;

  for (const m of all) {
    if (
      m.info.time.created > last.info.time.created ||
      (m.info.time.created === last.info.time.created && m.info.id > last.info.id)
    ) {
      last = m;
    }
  }

  return (
    last.info.role === "assistant" &&
    last.info.finish != null &&
    last.info.id !== callMessageID
  );
}
