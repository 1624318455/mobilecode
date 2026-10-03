import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { sessionDirectory } from "@/hooks/useAllSessions";
import { useT } from "@/lib/i18n";
import { createV2Client } from "@/lib/v2client";
import type { V2Client } from "@/lib/v2client";
import { projectWorktree } from "@/lib/v2types";
import { ReplyTracker } from "@/lib/replyTracker";
import { subscribeServerEvents } from "@/lib/serverEvents";
import type { Event } from "@/lib/serverEvents";
import { normalizeDirectory, type AggregateResult } from "@/lib/sessionAggregate";
import { addReplyTapListener, configureNotifications, ensureNotifyPermission, notifyReply } from "@/lib/systemNotify";
import { getVisibleSessionKey } from "@/lib/visibleSession";
import type { Server } from "@/stores";
import { useDiagLogStore } from "@/stores/diagLog";
import { useReplyHealthStore } from "@/stores/replyHealth";
import { unreadKey, useUnreadStore } from "@/stores/unread";

const MAX_DIRS = 12;
const RESUBSCRIBE_MS = 60 * 1000;
const REDISCOVER_MS = 15 * 1000;
const SESSION_POLL_MS = 10 * 1000;
const POLL_EVAL_BUDGET = 5;
// No request may hang forever: a stalled background socket (no RST, no
// error, no data) would wedge the whole poll loop behind one await.
const FETCH_TIMEOUT_MS = 15 * 1000;
// A run that ends without a terminal finish flag (abort, harness mirror)
// still counts as done once the session goes quiet this long.
const QUIET_MS = 90 * 1000;
// Intermediate tool steps carry finish="tool-calls" while the run goes on;
// only any OTHER non-null finish ends the run (verified: "stop").
const INTERMEDIATE_FINISH = "tool-calls";

interface SessionClock {
  updated?: number;
  created?: number;
}

interface MessageTail {
  evaluated: boolean;
  finishedId: string | null;
  terminal: boolean;
  lastId: string | null;
}

function withFetchTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("fetch timeout"));
    }, FETCH_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Global reply watcher: one mount in _layout, tracks every session on every
// server. Foreground -> unread red dots; background -> system notification.
// Unlike the chat screen subscription this one intentionally stays alive
// when the app goes to background (while the JS thread still runs).
//
// Two independent completion signals feed the same red dot, so a
// missed SSE no longer means a missed dot:
//   1. live SSE session.status / session.idle / assistant-finish, and
//   2. a 10s poll of the global session list + message tail (neither is
//      directory scoped, unlike /session/status which reads empty for
//      idle sessions).
export function useReplyWatcher(servers: Server[]) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const trackerRef = useRef(new ReplyTracker());
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const dirsRef = useRef(new Map<string, string[]>());
  const seenRef = useRef(new Map<string, number>());
  const notifiedRef = useRef(new Map<string, string>());
  const quietRef = useRef(new Map<string, { msgId: string; since: number }>());

  useEffect(() => {
    configureNotifications();

    if (useUnreadStore.getState().notifyEnabled) {
      void ensureNotifyPermission();
    }

    const mark = useReplyHealthStore.getState().mark;
    const appStateSub = AppState.addEventListener("change", (state) => {
      for (const server of serversRef.current) {
        if (state === "background") {
          mark(server.url, { lastBgAt: Date.now() });
        } else if (state === "active") {
          mark(server.url, { lastFgAt: Date.now() });
        }
      }
    });
    const removeTap = addReplyTapListener((tap) => {
      useUnreadStore.getState().markSeen(tap.serverId, tap.sessionId);
      router.push(
        `/server/${tap.serverId}/project/${tap.projectId}/session/${tap.sessionId}`,
      );
    });

    return () => {
      appStateSub.remove();
      removeTap();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanups: Array<() => void> = [];
    const tracker = trackerRef.current;
    const mark = useReplyHealthStore.getState().mark;

    function lookup(server: Server, sessionId: string): {
      projectId: string;
      title: string;
    } {
      const cached = queryClient.getQueryData<AggregateResult>(
        aggregateQueryKey(server.url),
      );
      const found = cached?.sessions.find((s) => s.id === sessionId);

      if (found) {
        const directory = sessionDirectory(found);

        return {
          projectId: directory ? encodeURIComponent(directory) : "global",
          title: found.title || `Session ${sessionId.slice(0, 8)}`,
        };
      }

      return { projectId: "global", title: `Session ${sessionId.slice(0, 8)}` };
    }

    function syncBusy(server: Server): void {
      mark(server.url, { busy: tracker.activeCount() });
    }

    function complete(server: Server, sessionId: string): void {
      const key = unreadKey(server.id, sessionId);
      const appState = AppState.currentState;
      mark(server.url, { lastDoneAt: Date.now(), lastDoneState: appState });

      if (getVisibleSessionKey() === key) {
        useUnreadStore.getState().markSeen(server.id, sessionId);

        return;
      }

      const state = useUnreadStore.getState();

      if (!state.dotEnabled && !state.notifyEnabled) {
        return;
      }

      const meta = lookup(server, sessionId);

      if (state.dotEnabled) {
        state.markUnread({
          serverId: server.id,
          sessionId,
          projectId: meta.projectId,
          title: meta.title,
          serverName: server.name,
          updatedAt: new Date().toISOString(),
        });
      }

      if (state.notifyEnabled && appState !== "active") {
        notifyReply({
          title: meta.title,
          body: server.name,
          serverId: server.id,
          projectId: meta.projectId,
          sessionId,
        })
          .then(() => {
            mark(server.url, { lastNotifyAt: Date.now(), lastNotifyError: null });
          })
          .catch((error) => {
            // Notification transport unavailable — the red dot still stands.
            const reason =
              error instanceof Error ? error.message : String(error);
            mark(server.url, { lastNotifyError: reason });
            useDiagLogStore
              .getState()
              .log(
                server.name,
                "error",
                `${t("diagnostics.logNotifyFail")}：${reason.slice(0, 60)}`,
              );
          });
      }
    }

    function noteBusy(server: Server, sessionId: string): void {
      tracker.noteActivity(unreadKey(server.id, sessionId));
      syncBusy(server);
    }

    // Returns true when this call closed a busy -> idle edge.
    function noteDone(server: Server, sessionId: string): boolean {
      const closed = tracker.noteIdle(unreadKey(server.id, sessionId));
      syncBusy(server);

      if (closed) {
        complete(server, sessionId);
      }

      return closed;
    }

    function onEvent(server: Server, event: Event): void {
      const was = useReplyHealthStore.getState().byUrl[server.url]?.state;
      mark(server.url, { state: "live", lastEventAt: Date.now() });

      if (was !== "live") {
        useDiagLogStore
          .getState()
          .log(server.name, "success", t("diagnostics.logWatcherLive"));
      }

      if (event.type === "session.status") {
        if (
          event.data.status.type === "busy" ||
          event.data.status.type === "retry"
        ) {
          noteBusy(server, event.data.sessionID);
        } else {
          noteDone(server, event.data.sessionID);
        }

        return;
      }

      if (event.type === "session.idle") {
        noteDone(server, event.data.sessionID);

        return;
      }

      if (event.type === "session.execution.started") {
        noteBusy(server, event.data.sessionID);

        return;
      }

      if (
        event.type === "session.execution.succeeded" ||
        event.type === "session.execution.interrupted"
      ) {
        noteDone(server, event.data.sessionID);

        return;
      }

      if (event.type === "session.execution.failed") {
        tracker.noteIdle(unreadKey(server.id, event.data.sessionID));
        syncBusy(server);

        return;
      }

      if (
        event.type === "session.text.delta" ||
        event.type === "session.step.streamed" ||
        event.type === "session.tool.called" ||
        event.type === "session.inbox.enqueued"
      ) {
        noteBusy(server, event.data.sessionID);

        return;
      }

      if (
        event.type === "permission.asked" ||
        event.type === "form.created"
      ) {
        const formSessionID =
          event.type === "form.created"
            ? event.data.form.sessionID
            : event.data.sessionID;
        noteBusy(server, formSessionID);

        return;
      }
    }

    function onError(server: Server): void {
      const errors =
        (useReplyHealthStore.getState().byUrl[server.url]?.errors ?? 0) + 1;
      mark(server.url, { state: "error", errors });
      useDiagLogStore
        .getState()
        .log(server.name, "error", t("diagnostics.logWatcherError"));
    }

    function dirsFromCache(server: Server): string[] {
      const cached = queryClient.getQueryData<AggregateResult>(
        aggregateQueryKey(server.url),
      );
      // Dedupe by normalized key (same folder, different spellings), but
      // subscribe with the first raw spelling: the server matches scoped
      // events against the directory verbatim.
      const seen = new Set<string>();
      const dirs: string[] = [];

      for (const s of cached?.sessions ?? []) {
        const raw = sessionDirectory(s);

        if (!raw) {
          continue;
        }

        const key = normalizeDirectory(raw);

        if (!seen.has(key)) {
          seen.add(key);
          dirs.push(raw);
        }
      }

      return dirs.slice(0, MAX_DIRS);
    }

    async function discoverDirs(server: Server): Promise<string[]> {
      const cached = dirsFromCache(server);

      if (cached.length > 0) {
        return cached;
      }

      try {
        const client = createV2Client({
          baseUrl: server.url,
          username: server.username,
          password: server.password,
        });

        try {
          const result = await withFetchTimeout(client.project.list());
          const seenWorktrees = new Set<string>();
          const worktrees: string[] = [];

          for (const p of result ?? []) {
            const worktree = projectWorktree(p);

            if (!worktree) {
              continue;
            }

            const key = normalizeDirectory(worktree);

            if (!seenWorktrees.has(key)) {
              seenWorktrees.add(key);
              worktrees.push(worktree);
            }
          }

          return worktrees.slice(0, MAX_DIRS);
        } catch {
          // Discovery or timeout failed — fall through to no dirs.
        }
      } catch {
        // Discovery failed — unscoped subscription still hears globals.
      }

      return [];
    }

    // REST fallback: completion from the message tail. Uses the GLOBAL
    // session list + per-session messages, neither of which is directory
    // scoped (verified: /session/status reads empty for idle sessions, so
    // it can never close the edge — this replaces that poll).
    async function readTail(
      client: V2Client,
      sessionId: string,
    ): Promise<MessageTail> {
      const none = (evaluated: boolean): MessageTail => ({
        evaluated,
        finishedId: null,
        terminal: false,
        lastId: null,
      });

      try {
        const result = await withFetchTimeout(
          client.message.list({
            sessionID: sessionId,
            limit: 200,
            order: "desc",
          }),
        );
        const all = result.data ?? [];

        if (all.length === 0) {
          return none(true);
        }

        let last = all[0] as (typeof all)[number];

        for (const m of all) {
          if (
            m.time.created > last.time.created ||
            (m.time.created === last.time.created && m.id > last.id)
          ) {
            last = m;
          }
        }

        const lastId = last.id;

        if (last.type === "assistant" && last.finish != null) {
          if (last.finish === INTERMEDIATE_FINISH) {
            return { evaluated: true, finishedId: null, terminal: false, lastId };
          }

          return { evaluated: true, finishedId: lastId, terminal: true, lastId };
        }

        return { evaluated: true, finishedId: null, terminal: false, lastId };
      } catch {
        return none(false);
      }
    }

    async function pollSessions(): Promise<void> {
      // Drop entries for servers that no longer exist (re-paired with a
      // new id, etc.) — the per-server prune below can't see them.
      const liveIds = new Set(serversRef.current.map((s) => s.id));
      const { items, clearForServer } = useUnreadStore.getState();
      const orphanIds = [
        ...new Set(
          Object.values(items)
            .map((e) => e.serverId)
            .filter((id) => !liveIds.has(id)),
        ),
      ];

      for (const id of orphanIds) {
        clearForServer(id);
      }

      for (const server of serversRef.current) {
        const health = useReplyHealthStore.getState().byUrl[server.url];
        mark(server.url, {
          lastPollAt: Date.now(),
          pollCount: (health?.pollCount ?? 0) + 1,
        });

        if (cancelled) {
          return;
        }

        try {
          const client = createV2Client({
            baseUrl: server.url,
            username: server.username,
            password: server.password,
          });
          const result = await withFetchTimeout(
            client.session.list({ limit: 200 }),
          );
          const live = new Map<string, boolean>();
          let budget = POLL_EVAL_BUDGET;

          for (const s of result.data ?? []) {
            if (cancelled) {
              return;
            }

            const key = unreadKey(server.id, s.id);
            const clock = s.time as (SessionClock & { archived?: boolean }) | undefined;
            live.set(key, clock?.archived === true);
            const time = s.time as SessionClock | undefined;
            const updated = time?.updated ?? time?.created ?? 0;
            const prev = seenRef.current.get(key);

            if (prev === undefined) {
              // Seed on first sight — never dot pre-existing state.
              seenRef.current.set(key, updated);

              continue;
            }

            if (updated <= prev) {
              // No change since last round: the tail is identical, so no
              // fetch is needed — but the quiet clock can still complete.
              const pending = quietRef.current.get(key);

              if (
                pending &&
                Date.now() - pending.since >= QUIET_MS &&
                (useUnreadStore.getState().seenAt[key] ?? 0) <= pending.since
              ) {
                quietRef.current.delete(key);

                if (notifiedRef.current.get(key) !== pending.msgId) {
                  notifiedRef.current.set(key, pending.msgId);
                  complete(server, s.id);
                }
              }

              continue;
            }

            if (budget <= 0) {
              continue;
            }

            budget--;
            const tail = await readTail(client, s.id);

            if (cancelled) {
              return;
            }

            if (!tail.evaluated) {
              // Fetch failed: keep the old mark so the next round retries.
              continue;
            }

            seenRef.current.set(key, updated);

            if (tail.terminal && tail.finishedId !== null) {
              quietRef.current.delete(key);

              if (notifiedRef.current.get(key) === tail.finishedId) {
                continue;
              }

              notifiedRef.current.set(key, tail.finishedId);
              complete(server, s.id);

              continue;
            }

            // No terminal finish: count the tail done only after it sits
            // quiet (covers abort / harness mirror / missing-finish tails).
            if (tail.lastId === null) {
              quietRef.current.delete(key);

              continue;
            }

            const pending = quietRef.current.get(key);

            if (pending && pending.msgId === tail.lastId) {
              if (Date.now() - pending.since < QUIET_MS) {
                continue;
              }

              quietRef.current.delete(key);

              if (
                notifiedRef.current.get(key) === tail.lastId ||
                (useUnreadStore.getState().seenAt[key] ?? 0) > pending.since
              ) {
                continue;
              }

              notifiedRef.current.set(key, tail.lastId);
              complete(server, s.id);
            } else {
              quietRef.current.set(key, { msgId: tail.lastId, since: Date.now() });
            }
          }

          // Drop marks for sessions that no longer exist or were archived
          // (archived sessions show nowhere, so their dots would be
          // phantom counter weight only).
          for (const key of [...seenRef.current.keys()]) {
            if (!key.startsWith(`${server.id}:`)) {
              continue;
            }

            if (!live.has(key) || live.get(key) === true) {
              seenRef.current.delete(key);
              notifiedRef.current.delete(key);
              quietRef.current.delete(key);
              useUnreadStore
                .getState()
                .markSeen(server.id, key.slice(server.id.length + 1));
            }
          }
        } catch {
          // Poll failed or timed out — SSE still covers the live path.
        }
      }
    }

    async function start(): Promise<void> {
      for (const server of serversRef.current) {
        if (cancelled) {
          return;
        }

        mark(server.url, { state: "connecting" });
        const dirs = await discoverDirs(server);

        if (cancelled) {
          return;
        }

        dirsRef.current.set(server.url, dirs);
        mark(server.url, { dirs: dirs.length });

        // Unscoped first (global session created/updated/deleted), then one
        // stream per known directory (the server drops scoped events
        // without a directory match).
        for (const directory of [undefined, ...dirs]) {
          if (cancelled) {
            return;
          }

          cleanups.push(
            subscribeServerEvents(server, {
              directory,
              onError: () => {
                onError(server);
              },
              onEvent: (event) => {
                onEvent(server, event);
              },
            }),
          );
        }
      }
    }

    function stop(): void {
      for (const cleanup of cleanups) {
        cleanup();
      }

      cleanups = [];
    }

    async function resubscribe(): Promise<void> {
      // Re-discover first: a session in a brand-new directory only becomes
      // audible once its directory is subscribed.
      for (const server of serversRef.current) {
        if (cancelled) {
          return;
        }

        useDiagLogStore
          .getState()
          .log(server.name, "warn", t("diagnostics.logResubscribe"));
        const dirs = await discoverDirs(server);

        if (cancelled) {
          return;
        }

        dirsRef.current.set(server.url, dirs);
        mark(server.url, { dirs: dirs.length });
      }

      if (cancelled) {
        return;
      }

      stop();
      void start();
    }

    void start();
    const resubTimer = setInterval(() => {
      // While any server still has zero audible directories, retry discovery
      // fast — otherwise the watcher is deaf and the user sees nothing.
      const needsDirs = serversRef.current.some(
        (s) => (dirsRef.current.get(s.url) ?? []).length === 0,
      );

      if (needsDirs) {
        void resubscribe();
      } else {
        stop();
        void start();
      }
    }, RESUBSCRIBE_MS);
    const rediscoverTimer = setInterval(() => {
      if (
        serversRef.current.some(
          (s) => (dirsRef.current.get(s.url) ?? []).length === 0,
        )
      ) {
        void resubscribe();
      }
    }, REDISCOVER_MS);
    const pollTimer = setInterval(() => {
      void pollSessions();
    }, SESSION_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(resubTimer);
      clearInterval(rediscoverTimer);
      clearInterval(pollTimer);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers, queryClient]);
}
