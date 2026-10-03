// Which session the user is currently looking at (serverId:sessionId,
// see stores/unread unreadKey), or null when outside any chat screen.
// Written by the chat screen on focus/blur, read by the global reply
// watcher so the open session never earns an unread dot for itself.
let current: string | null = null;

export function setVisibleSessionKey(key: string | null): void {
  current = key;
}

export function getVisibleSessionKey(): string | null {
  return current;
}
