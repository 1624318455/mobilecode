import type { ChatInfo, ChatPart, ChatTextPart } from "@/lib/v2messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Check, Clock, Settings, Volume2, VolumeX } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { Keyframe } from "react-native-reanimated";

import { ChatMessage } from "@/components/ChatMessage";
import type { PartLongPress } from "@/components/ChatMessagePart";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { EmptyState } from "@/components/EmptyState";
import { MessageActionMenu } from "@/components/MessageActionMenu";
import type { MenuAnchor } from "@/components/MessageActionMenu";
import { BubbleSkeleton } from "@/components/SkeletonRows";
import { useEdgeSpeech } from "@/hooks/useEdgeSpeech";
import { useT } from "@/lib/i18n";
import { toSpeakableText } from "@/lib/edgeTts";
import { MentionedFile, MessageInput } from "@/components/MessageInput";
import { RecentSessionsDrawer } from "@/components/RecentSessionsDrawer";
import {
  buildHistoryDigest,
  buildRescueText,
  setPendingDigest,
  takePendingDigest,
} from "@/lib/historyDigest";
import { PermissionBanner } from "@/components/PermissionBanner";
import { FormBanner } from "@/components/FormBanner";
import { useAgents } from "@/hooks/useAgents";
import { useModels } from "@/hooks/useModels";
import { usePermissions } from "@/hooks/usePermissions";
import { useProjects } from "@/hooks/useProjects";
import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { useSessionForms } from "@/hooks/useSessionForms";
import { useServerEvents } from "@/hooks/useServerEvents";
import { useSessionMessages } from "@/hooks/useSessionMessages";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { Identifier } from "@/lib/id";
import { createV2Client } from "@/lib/v2client";
import { sessionDirectoryOf } from "@/lib/v2types";
import { resolveProjectPath } from "@/lib/sessionAggregate";
import { setVisibleSessionKey } from "@/lib/visibleSession";
import { Server, useAppStore } from "@/stores";
import { usePickerStore } from "@/stores/picker";
import { useReplyHealthStore } from "@/stores/replyHealth";
import { unreadKey, useUnreadStore } from "@/stores/unread";

interface SessionChatContentProps {
  server: Server;
  sessionId: string;
  projectId: string;
}

type CachedMessage = {
  info: ChatInfo;
  parts: ChatPart[];
  optimistic?: boolean;
};

// Error ids already rescued this app run: never show the rescue card for
// them again (prevents fork→fail→fork loops when returning to the page).
const rescuedErrorIds = new Set<string>();

interface OutgoingFile {
  uri: string;
  name: string;
  mention?: { start: number; end: number; text: string };
}

interface OutgoingMessage {
  text: string;
  files: OutgoingFile[];
}

// Slide-up + fade-in for the optimistic message only (server-confirmed
// items render without animation so history never re-animates).
const OptimisticEntering = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 28 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(280);

function buildOutgoing(
  text: string,
  files: MentionedFile[],
  projectPath: string | undefined,
): OutgoingMessage {
  const out: OutgoingFile[] = [];

  for (const file of files) {
    const isAbsolute =
      file.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file.path);
    const filePath = isAbsolute
      ? file.path
      : `${(projectPath || "").replace(/[\\/]+$/, "")}/${file.path}`;
    const filename = file.path.split("/").pop() || file.path;
    // The @mention token stays in the text for display; record its span
    // so the server links the attachment back to the reference.
    const token = `@${file.path}`;
    const start = text.indexOf(token);
    const entry: OutgoingFile = {
      uri: `file://${filePath}`,
      name: filename,
    };

    if (start >= 0) {
      entry.mention = { start, end: start + token.length, text: token };
    }

    out.push(entry);
  }

  return { text, files: out };
}

export function SessionChatContent({
  server,
  sessionId,
  projectId,
}: SessionChatContentProps) {
  const queryClient = useQueryClient();
  const theme = useAppTheme();
  const { t } = useT();
  const flatListRef = useRef<FlatList>(null);
  // Distance between the top of the screen and the top of the KeyboardAvoidingView
  const headerHeight = useHeaderHeight();

  const selectedAgent = usePickerStore((s) => s.selectedAgent);  const selectedModel = usePickerStore((s) => s.selectedModel);
  const setAgents = usePickerStore((s) => s.setAgents);
  const setModels = usePickerStore((s) => s.setModels);
  const setSelectedAgent = usePickerStore((s) => s.setSelectedAgent);
  const setSelectedModel = usePickerStore((s) => s.setSelectedModel);

  const { data: projects = [] } = useProjects(server);

  const { data: session } = useQuery({
    queryKey: ["server", server.url, "sessions", sessionId],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.get({
        sessionID: sessionId,
      });
    },
  });

  const sessionDir = session ? sessionDirectoryOf(session) : "";
  const projectPath = resolveProjectPath(
    projectId,
    projects,
    sessionDir || undefined,
  );

  const sessionTitle =
    session?.title || `Session ${sessionId?.slice(0, 8) || "Chat"}`;

  // Opening the chat marks it read — even when the user sends nothing and
  // backs out. Also tells the global reply watcher this session is visible
  // so it never earns an unread dot for itself.
  useFocusEffect(
    useCallback(() => {
      useUnreadStore.getState().markSeen(server.id, sessionId);
      setVisibleSessionKey(unreadKey(server.id, sessionId));

      return () => {
        setVisibleSessionKey(null);
      };
    }, [server.id, sessionId]),
  );

  const {
    data: messages = [],
    isLoading,
    error,
  } = useSessionMessages(server, sessionId);

  const { data: agents = [] } = useAgents(server);
  const { data: models = [] } = useModels(server);
  const { data: pendingForms = [] } = useSessionForms(server, sessionId);
  const { data: pendingPermissions = [] } = usePermissions(
    server,
    sessionId,
    sessionDir || projectPath || undefined,
  );

  // Context usage: session cumulative tokens vs the running model's window.
  // Percent = (input + output) / limit.context; cache reads ride along in
  // input accounting, so they are shown separately, not double-counted.
  const contextUsage = useMemo(() => {
    const runtime = session as
      | undefined
      | {
          tokens?: {
            input?: number;
            output?: number;
            cache?: { read?: number };
          };
          model?: { id?: string; providerID?: string };
        };

    if (!runtime?.tokens) {
      return null;
    }

    const input = runtime.tokens.input ?? 0;
    const output = runtime.tokens.output ?? 0;
    const cached = runtime.tokens.cache?.read ?? 0;
    const used = input + output;
    const modelId = runtime.model?.id;
    const providerID = runtime.model?.providerID;
    const model = models.find(
      (m) => m.id === modelId && m.providerID === providerID,
    );
    const limit = model?.limitContext ?? null;
    const modelName =
      model?.name ?? (modelId ? String(modelId) : "");

    return {
      used,
      input,
      output,
      cached,
      limit,
      percent: limit && limit > 0 ? Math.min(1, used / limit) : null,
      modelName,
    };
  }, [models, session]);

  // Busy sessions (e.g. harnessed/bridged ones) queue prompts instead of
  // running them: surface the state and offer a fork escape hatch.
  // A "retry" state carries the provider reason (e.g. free quota out).
  const { data: sessionRun, dataUpdatedAt: statusAt } = useSessionStatus(
    server,
    sessionId,
    sessionDir || projectPath || undefined,
  );
  // A dead run leaves no finish flag and the status query may keep failing
  // while holding stale data: treat anything older than 30s as unknown →
  // idle, so dots/banner converge instead of spinning forever.
  const statusStale = Date.now() - (statusAt ?? 0) > 30000;
  // A retry/busy record outlives the run it waited for (the server never
  // clears them: a later run can finish while attempt/next still point at
  // the old quota window, and a dead run can leave the busy flag stuck).
  // When the newest message is already terminal, no run is waiting.
  // Additionally a retry is not a wait while a run is visibly progressing
  // (streaming deltas): the fossil record would otherwise sit on top of a
  // healthy run every time the user sends a message.
  const newestMessage = useMemo(() => {
    let last: (typeof messages)[number] | null = null;

    for (const m of messages) {
      if (
        !last ||
        m.info.time.created > last.info.time.created ||
        (m.info.time.created === last.info.time.created && m.info.id > last.info.id)
      ) {
        last = m;
      }
    }

    return last;
  }, [messages]);
  const statusStuck =
    (sessionRun?.state === "retry" || sessionRun?.state === "busy") &&
    newestMessage?.info.role === "assistant" &&
    newestMessage.info.finish != null;
  const sessionBusy = statusStale || statusStuck ? "idle" : (sessionRun?.state ?? "idle");
  const sessionActive = sessionBusy !== "idle";

  const messagesKey = useMemo(
    () => ["server", server.url, "session", sessionId, "messages"] as const,
    [server.url, sessionId],
  );

  // ---- Streaming (item 4): buffer SSE deltas, flush to cache ~10/s ----
  interface BufferedDelta {
    messageID: string;
    partID: string;
    delta: string;
  }

  const deltaBufRef = useRef<BufferedDelta[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followRef = useRef(true);
  const [streamingIds, setStreamingIds] = useState<string[]>([]);
  // Bumped on every session-idle transition; drives auto-read (run fully
  // complete) without re-rendering the message flow itself.
  const [idleTick, setIdleTick] = useState(0);
  // Last observed session activity (any delta/part/message event for this
  // session): proves the run is working right now.
  const activityAtRef = useRef(0);

  function pokeActivity(): void {
    activityAtRef.current = Date.now();
  }

  const clearStreaming = useCallback((messageID: string) => {
    setStreamingIds((prev) =>
      prev.includes(messageID) ? prev.filter((id) => id !== messageID) : prev,
    );
  }, []);

  const flushDeltas = useCallback(() => {
    flushTimerRef.current = null;
    const batch = deltaBufRef.current;

    if (batch.length === 0) {
      return;
    }

    deltaBufRef.current = [];
    const touched = new Set(batch.map((b) => b.messageID));
    pokeActivity();
    queryClient.setQueryData<CachedMessage[]>(messagesKey, (old) => {
      if (!old) {
        return old;
      }

      const byId = new Map(old.map((m) => [m.info.id, m]));
      let changed = false;

      for (const b of batch) {
        let msg = byId.get(b.messageID);

        if (!msg) {
          msg = {
            info: {
              id: b.messageID,
              role: "assistant",
              time: { created: Date.now() },
            },
            parts: [],
          };
        }

        const idx = msg.parts.findIndex((p) => p.id === b.partID);

        if (idx >= 0) {
          const part = msg.parts[idx];

          if (part && part.type === "text") {
            const next = [...msg.parts];
            next[idx] = { ...part, text: part.text + b.delta };
            msg = { ...msg, parts: next };
            byId.set(b.messageID, msg);
            changed = true;
          }
        } else {
          const stub: ChatTextPart = {
            id: b.partID,
            type: "text",
            text: b.delta,
          };
          msg = { ...msg, parts: [...msg.parts, stub] };
          byId.set(b.messageID, msg);
          changed = true;
        }
      }

      if (!changed) {
        return old;
      }

      const known = new Set(old.map((m) => m.info.id));

      return [
        ...old.map((m) => byId.get(m.info.id) ?? m),
        ...[...byId.values()].filter((m) => !known.has(m.info.id)),
      ];
    });
    setStreamingIds((prev) => {
      let next = prev;

      for (const id of touched) {
        if (!next.includes(id)) {
          next = [...next, id];
        }
      }

      return next;
    });

    if (followRef.current) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [messagesKey, queryClient, sessionId]);

  const queueDelta = useCallback(
    (messageID: string, partID: string, delta: string) => {
      deltaBufRef.current.push({ messageID, partID, delta });

      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushDeltas, 100);
      }
    },
    [flushDeltas],
  );

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  // SSE subscription: millisecond-level invalidation for permission,
  // forms and text deltas. Polling hooks above stay as offline fallback.
  // v2 /api/event is a global firehose, so every branch filters by the
  // envelope's data.sessionID itself.
  useServerEvents(server, {
    directory: sessionDir || projectPath || undefined,
    onEvent: (event) => {
      if (event.type === "permission.asked" || event.type === "permission.replied") {
        if (event.data.sessionID === sessionId) {
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "session", sessionId, "permissions"],
          });
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "session", sessionId, "messages"],
          });
        }
        return;
      }

      if (
        event.type === "form.created" ||
        event.type === "form.replied" ||
        event.type === "form.cancelled"
      ) {
        const formSessionID =
          event.type === "form.created"
            ? event.data.form.sessionID
            : event.data.sessionID;

        if (formSessionID === sessionId) {
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "session", sessionId, "forms"],
          });
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "session", sessionId, "messages"],
          });
        }
        return;
      }

      // Streaming deltas: buffer + throttled cache patch, NOT a full
      // refetch per token. The part id mirrors the normalizer
      // (`${messageID}-${ordinal}`) so the stub merges into the
      // canonical part when the page refetch lands.
      if (event.type === "session.text.delta") {
        if (
          event.data.sessionID === sessionId &&
          event.data.delta
        ) {
          queueDelta(
            event.data.assistantMessageID,
            `${event.data.assistantMessageID}-${event.data.ordinal}`,
            event.data.delta,
          );
        }

        return;
      }

      if (
        event.type === "session.text.ended" ||
        event.type === "session.step.streamed" ||
        event.type === "session.tool.success" ||
        event.type === "session.tool.failed"
      ) {
        if (event.data.sessionID === sessionId) {
          pokeActivity();
          queryClient.invalidateQueries({
            queryKey: messagesKey,
          });
        }

        return;
      }

      if (
        event.type === "session.execution.started" ||
        event.type === "session.step.started" ||
        event.type === "session.tool.called"
      ) {
        if (event.data.sessionID === sessionId) {
          pokeActivity();
          seenBusyRef.current = true;
        }

        return;
      }

      if (
        event.type === "session.execution.succeeded" ||
        event.type === "session.execution.failed" ||
        event.type === "session.execution.interrupted"
      ) {
        if (event.data.sessionID === sessionId) {
          setStreamingIds([]);
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "sessions", sessionId],
          });
          queryClient.invalidateQueries({
            queryKey: messagesKey,
          });
          queryClient.invalidateQueries({
            queryKey: aggregateQueryKey(server.url),
          });
          setIdleTick((n) => n + 1);
        }

        return;
      }

      if (
        event.type === "session.inbox.enqueued" ||
        event.type === "session.inbox.delivered"
      ) {
        if (event.data.sessionID === sessionId) {
          queryClient.invalidateQueries({
            queryKey: messagesKey,
          });
        }

        return;
      }

      if (event.type === "session.usage.updated") {
        if (event.data.sessionID === sessionId) {
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "sessions", sessionId],
          });
        }

        return;
      }

      if (event.type === "session.status" || event.type === "session.idle") {
        if (event.data.sessionID === sessionId) {
          if (event.type === "session.status") {
            if (
              event.data.status.type === "busy" ||
              event.data.status.type === "retry"
            ) {
              seenBusyRef.current = true;
            }
          }

          if (
            event.type === "session.idle" ||
            (event.type === "session.status" &&
              event.data.status.type === "idle")
          ) {
            setIdleTick((n) => n + 1);
          }
          // Stream tail: clear all cursors, converge to canonical state.
          setStreamingIds([]);
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "sessions", sessionId],
          });
          queryClient.invalidateQueries({
            queryKey: messagesKey,
          });
        }
        return;
      }

      if (
        event.type === "session.created" ||
        event.type === "session.deleted" ||
        event.type === "session.renamed" ||
        event.type === "session.moved"
      ) {
        queryClient.invalidateQueries({
          queryKey: aggregateQueryKey(server.url),
        });
        return;
      }
    },
  });

  // Sync agents and models to the picker store
  useEffect(() => {
    setAgents(agents);
  }, [agents, setAgents]);

  useEffect(() => {
    setModels(models);
  }, [models, setModels]);

  const sortedMessages = useMemo(
    () =>
      // Sort by wall-clock, NOT by id: ids are only roughly time-ordered
      // (and foreign ids not at all), so id-sort scatters replies away
      // from their prompts until they look "missing".
      [...messages]
        .sort(
          (a, b) =>
            a.info.time.created - b.info.time.created ||
            (a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0),
        )
        .reverse(),
    [messages],
  );

  // Auto read-aloud: when the header toggle is on, speak new assistant
  // replies once (Edge neural voice, same engine as the long-press
  // "read aloud" menu). Two channels, split by whether a run was observed:
  // - run observed busy (normal agent run): speak the newest reply when the
  //   run fully completes (session idle) — never sentence-by-sentence;
  // - never busy (harness-mirrored replies arrive already finished):
  //   speak on arrival.
  // Pre-existing history never speaks (seeded); toggling off or leaving
  // stops playback.
  const autoRead = useAppStore((s) => s.autoRead);
  const setAutoRead = useAppStore((s) => s.setAutoRead);
  const speech = useEdgeSpeech();
  const spokenRef = useRef<string | null>(null);
  const seenAtEnableRef = useRef(new Set<string>());
  const seededRef = useRef<string | null>(null);
  // Latch: set once this session is observed busy/retry. Distinguishes a
  // live run (wait for idle) from a mirror that arrives finished.
  const seenBusyRef = useRef(false);

  function markSeenAtEnable(): void {
    seenAtEnableRef.current = new Set(
      [...sortedMessages]
        .filter(
          (m) =>
            m.info.role === "assistant" &&
            m.info.finish != null &&
            m.parts.some((p) => p.type === "text" && p.text.trim() !== ""),
        )
        .map((m) => m.info.id)
        .slice(-50),
    );
  }

  // Speak the newest finished assistant reply unless it was already spoken
  // or already existed when auto-read was enabled for this session.
  // Reads the cache directly so it can run from event handlers.
  // Gated on seeding: never speak before this session's backlog has been
  // marked seen (kills the enter-old-session race where an idle snapshot
  // arrives before messages finish loading).
  const speakLatestFinished = useCallback((why: string) => {
    if (!useAppStore.getState().autoRead) {
      return;
    }

    if (seededRef.current !== sessionId) {
      return;
    }

    const cached =
      queryClient.getQueryData<CachedMessage[]>(messagesKey) ?? [];
    let latest: CachedMessage | null = null;

    for (const m of cached) {
      if (
        m.info.role !== "assistant" ||
        m.info.finish == null ||
        !m.parts.some((p) => p.type === "text" && p.text.trim() !== "")
      ) {
        continue;
      }

      if (
        !latest ||
        m.info.time.created > latest.info.time.created ||
        (m.info.time.created === latest.info.time.created &&
          m.info.id > latest.info.id)
      ) {
        latest = m;
      }
    }

    if (
      !latest ||
      latest.info.id === spokenRef.current ||
      seenAtEnableRef.current.has(latest.info.id)
    ) {
      return;
    }

    spokenRef.current = latest.info.id;
    seenBusyRef.current = false;
    useReplyHealthStore.getState().mark(server.url, {
      lastSpeakAt: Date.now(),
      lastSpeakSid: sessionId,
      lastSpeakMsg: latest.info.id,
      lastSpeakWhy: why,
    });
    const text = latest.parts
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n")
      .trim();
    const speakable = toSpeakableText(text).slice(0, 4000).trim();

    if (speakable) {
      void speech.speak(speakable);
    }
  }, [messagesKey, queryClient, speech, sessionId]);

  useEffect(() => {
    spokenRef.current = null;
    seenBusyRef.current = false;
    speech.stop();
  }, [sessionId]);

  // Leaving the screen stops this session's audio: expo-router keeps
  // pushed screens mounted, so without this the previous session keeps
  // reading over the newly opened one. Ref-indirected: speech identity
  // changes with playback status, which must not resubscribe this.
  const speechRef = useRef(speech);
  speechRef.current = speech;

  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          speechRef.current.stop();
        } catch {
          // Player already released; nothing to stop.
        }
      };
    }, []),
  );

  useEffect(() => {
    if (!autoRead) {
      speech.stop();

      return;
    }

    // Seed only against loaded messages: seeding mid-load marks an empty
    // backlog as seen AND sets seeded, which then skips the real seeding
    // in the arrival path — the exact enter-old-session false read.
    if (!isLoading) {
      markSeenAtEnable();
      seededRef.current = sessionId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, isLoading]);

  // Mirror path: replies that arrive already finished (harness mirrors,
  // short runs that complete between polls) never observe busy, so the
  // idle trigger would miss them. Speak-on-arrival ONLY while no run is
  // being tracked (seenBusy): during a live run, arrivals are intermediate
  // steps and the idle trigger owns the single end-of-run read.
  // First evaluation per session only seeds (messages may still load).
  useEffect(() => {
    if (!autoRead || seenBusyRef.current) {
      return;
    }

    if (seededRef.current !== sessionId) {
      if (isLoading) {
        return;
      }

      markSeenAtEnable();
      seededRef.current = sessionId;

      return;
    }

    speakLatestFinished("arrival");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, sortedMessages, sessionId]);

  // Fallback for a missed idle event (SSE gap while the status poll still
  // converges): when the status flips to idle, the run is over too.
  // Also arms the busy latch for runs the poll sees but SSE missed.
  const prevRunState = useRef<string | null>(null);

  useEffect(() => {
    const state = sessionRun?.state ?? null;

    if (state === "busy" || state === "retry") {
      seenBusyRef.current = true;
    }

    if (prevRunState.current !== "idle" && state === "idle") {
      speakLatestFinished("poll");
    }

    prevRunState.current = state;
  }, [sessionRun, speakLatestFinished]);

  useEffect(() => {
    if (idleTick > 0) {
      speakLatestFinished("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleTick]);

  // The bottom banner stack always shows every pending request, even
  // when the same request also renders inline in the message flow.
  // Hiding the banner on inline-match caused dead ends: when the tool
  // part arrived but the request list was still in flight (or IDs
  // mismatched), neither surface offered an answer UI and the session
  // looked stuck on "Busy". Duplicate UI is a minor cost; a missing
  // answer UI blocks the run, so banners stay authoritative.
  const bannerPermissions = pendingPermissions;
  const bannerForms = pendingForms;

  // Left drawer with recently active sessions (replaces the back button).
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Rescue card: when the NEWEST message is a failed run whose provider
  // rejected replayed encrypted reasoning (typical after forking a long
  // history), offer one-tap clean-session resend. The failure surfaces as
  // a stored run-error message, NOT as a prompt-call rejection, so the
  // send mutation's onError can never see it — watch the timeline instead.
  const newestRunError = useMemo(() => {
    const newest = sortedMessages[0];

    if (
      !newest ||
      newest.info.role !== "assistant" ||
      !newest.info.error ||
      rescuedErrorIds.has(newest.info.id)
    ) {
      return null;
    }

    const err = newest.info.error;
    const haystack = `${err.name} ${err.message ?? ""}`;

    if (!/reasoning|encrypted/i.test(haystack)) {
      return null;
    }

    return newest;
  }, [sortedMessages]);

  const rescueMutation = useMutation({
    mutationFn: async () => {
      const latestUser = sortedMessages.find((m) => m.info.role === "user");
      const failedId = newestRunError?.info.id;

      if (!latestUser) {
        throw new Error("No user message to resend");
      }

      const question = latestUser.parts
        .filter(
          (p): p is Extract<ChatPart, { type: "text" }> => p.type === "text",
        )
        .map((p) => p.text)
        .join("\n");
      // Carry recent context along: the new session starts blank, so pack
      // an extractive digest (text only, never reasoning/tool parts) above
      // the question in a single run.
      const text = buildRescueText(
        buildHistoryDigest(sortedMessages, sessionTitle),
        question,
      );
      const dir = sessionDir || projectPath || undefined;
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      // A fork copies poisoned history verbatim and can never run, so
      // rescue always starts clean.
      const created = await client.session.create(
        dir ? { location: { directory: dir } } : undefined,
      );
      const newId = created.id;

      await client.session.prompt({
        sessionID: newId,
        id: Identifier.ascending("message"),
        text,
      });

      if (failedId) {
        rescuedErrorIds.add(failedId);
      }

      return newId;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url],
      });
      Alert.alert(t("sessionBusy.forkFallbackTitle"), t("sessionBusy.forkFallbackMsg"));
      router.push({
        pathname:
          "/server/[serverId]/project/[projectId]/session/[sessionId]",
        params: { serverId: server.id, projectId, sessionId: newId },
      });
    },
  });

  // Long-press action menu (copy/select/speak/share) for AI replies.
  const [menuFor, setMenuFor] = useState<(PartLongPress & { anchor: MenuAnchor }) | null>(null);
  const [selectablePartId, setSelectablePartId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleLongPressText = useCallback((info: PartLongPress) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(false);
    setMenuFor({ ...info, anchor: { x: info.x, y: info.y } });
  }, []);

  const handleCopy = useCallback(async () => {
    if (!menuFor || !menuFor.text.trim()) {
      return;
    }

    await Clipboard.setStringAsync(menuFor.text);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      setMenuFor(null);
    }, 600);
  }, [menuFor]);

  const handleSelectText = useCallback(() => {
    if (!menuFor) {
      return;
    }

    setSelectablePartId(menuFor.partId);
    setMenuFor(null);
  }, [menuFor]);

  const handleSpeakToggle = useCallback(() => {
    if (speech.status === "playing" || speech.status === "loading") {
      speech.stop();
      setMenuFor(null);

      return;
    }

    if (!menuFor || !menuFor.text.trim()) {
      return;
    }

    setMenuFor(null);
    void speech.speak(toSpeakableText(menuFor.text));
  }, [menuFor, speech]);

  // v2 removed server-side share links: share the message text itself.
  const handleShare = useCallback(async () => {
    if (!menuFor || !menuFor.text.trim()) {
      return;
    }

    setSharing(true);

    try {
      setMenuFor(null);
      await Share.share({ message: menuFor.text });
    } catch {
      Alert.alert(t("menu.share"), t("menu.shareFailed"));
    } finally {
      setSharing(false);
    }
  }, [menuFor, t]);

  useEffect(() => {
    if (speech.error) {
      Alert.alert(t("menu.speak"), t("menu.speechFailed"));
    }
  }, [speech.error, t]);

  const renderMessage = useCallback(
    ({ item }: { item: (typeof sortedMessages)[number] }) => {
      const node = (
        <ChatMessage
          message={item}
          server={server}
          pendingPermissions={pendingPermissions}
        selectablePartId={selectablePartId}
        onLongPressText={handleLongPressText}
        isStreaming={
          sessionActive && streamingIds.includes(item.info.id)
        }
        sessionActive={sessionActive}
      />
      );

      if ((item as CachedMessage).optimistic) {
        return <Animated.View entering={OptimisticEntering}>{node}</Animated.View>;
      }

      return node;
    },
    [server, pendingPermissions, selectablePartId, handleLongPressText, streamingIds, sessionActive],
  );

  const handleChatScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Inverted list: offset 0 is the newest end. Only follow the stream
      // while pinned near it; reading history pauses auto-follow.
      followRef.current = e.nativeEvent.contentOffset.y < 120;
    },
    [],
  );

  const latestUserMessage = sortedMessages.find((m) => m.info.role === "user");
  // v2 sessions carry the live agent/model selection (user messages do
  // not), so the pickers sync from the session instead of the transcript.
  const currentModel = session?.model
    ? {
        modelID: session.model.id,
        providerID: session.model.providerID,
      }
    : {
        modelID: "big-pickle",
        providerID: "opencode",
      };

  // Track the session selection by key: a NEWER key (fresh load, or the
  // server applying a just-sent switch) syncs the pickers from it. A user
  // override made through the picker survives because the key does not
  // change underneath it. Sessions with no selection yet fall back to the
  // first model so the picker never renders empty.
  const appliedSessionKey = useRef<string | null>(null);
  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    const key = session
      ? `${session.id}@${session.agent ?? ""}@${session.model?.providerID ?? ""}/${session.model?.id ?? ""}`
      : "none";

    if (appliedSessionKey.current === key) {
      return;
    }

    appliedSessionKey.current = key;

    if (
      session?.agent &&
      agents.some((a) => a.name === session.agent)
    ) {
      setSelectedAgent(session.agent);
    }

    const match = session?.model
      ? models.find(
          (m) =>
            m.id === session.model?.id &&
            m.providerID === session.model?.providerID,
        )
      : undefined;

    setSelectedModel(match || models[0]);
  }, [
    agents,
    models,
    session,
    setSelectedAgent,
    setSelectedModel,
  ]);

  const modelForSend = selectedModel
    ? { modelID: selectedModel.id, providerID: selectedModel.providerID }
    : currentModel;

  // What the chip shows: prefer the picked model, but fall back to the
  // session selection so the name is correct on first paint instead of
  // waiting for the provider catalog.
  const displayModel =
    selectedModel ||
    (session?.model
      ? {
          id: session.model.id,
          providerID: session.model.providerID,
          name: session.model.id,
        }
      : undefined);

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      messageID,
      outgoing,
    }: {
      messageID: string;
      outgoing: OutgoingMessage;
    }) => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      // v2 prompts carry no agent/model: align the session first so the
      // run uses what the pickers show.
      if (selectedAgent && selectedAgent !== session?.agent) {
        await client.session.switchAgent({
          sessionID: sessionId,
          agent: selectedAgent,
        });
      }

      if (
        modelForSend &&
        (modelForSend.modelID !== session?.model?.id ||
          modelForSend.providerID !== session?.model?.providerID)
      ) {
        await client.session.switchModel({
          sessionID: sessionId,
          model: {
            id: modelForSend.modelID,
            providerID: modelForSend.providerID,
          },
        });
      }

      return client.session.prompt({
        sessionID: sessionId,
        id: messageID,
        text: outgoing.text,
        files: outgoing.files.length > 0 ? outgoing.files : undefined,
      });
    },
    // Optimistic insert: the message appears instantly (with slide-up +
    // fade-in) instead of waiting seconds for the server round-trip.
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const prev = queryClient.getQueryData<CachedMessage[]>(messagesKey);

      const optimistic: CachedMessage = {
        info: {
          id: variables.messageID,
          role: "user",
          time: { created: Date.now() },
        },
        parts: [
          { id: variables.messageID, type: "text", text: variables.outgoing.text },
        ],
        optimistic: true,
      };
      queryClient.setQueryData<CachedMessage[]>(messagesKey, [
        ...(prev ?? []),
        optimistic,
      ]);
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);

      return { messageID: variables.messageID };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData<CachedMessage[]>(messagesKey, (old) =>
          (old ?? []).filter((m) => m.info.id !== context.messageID),
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messagesKey,
      });
      // First message in a fresh session mints its title/directory entry:
      // refresh the aggregate so Recents (and the desktop-visible session
      // list) picks it up without waiting for staleTime.
      queryClient.invalidateQueries({
        queryKey: aggregateQueryKey(server.url),
      });
    },
  });

  const handleSend = useCallback(
    (text: string, files: MentionedFile[]) => {
      // A digest staged by the busy-fork escape hatch rides on the first
      // send, so the fresh session gets context without an extra run.
      const pending = takePendingDigest(sessionId);
      const finalText = pending ? buildRescueText(pending, text) : text;
      sendMessageMutation.mutate({
        messageID: Identifier.ascending("message"),
        outgoing: buildOutgoing(finalText, files, projectPath),
      });
    },
    [projectPath, sendMessageMutation, sessionId],
  );

  // Send-button stop: while the session is running the send key morphs
  // into a stop key (see MessageInput isBusy). No confirm — speed matters
  // mid-stream; a mistaken tap just stops a run the user can resume.
  const abortMutation = useMutation({
    mutationFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.interrupt({
        sessionID: sessionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", sessionId, "status"],
      });
      queryClient.invalidateQueries({
        queryKey: messagesKey,
      });
    },
    onError: (error) => {
      Alert.alert(t("sessionBusy.abortTitle"), (error as Error).message);
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: sessionTitle,
          headerLeft: () => (
            <Pressable
              onPress={() => setDrawerOpen(true)}
              className="p-2"
              accessibilityLabel={t("sessionDrawer.title")}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Clock size={24} color={theme.colors.primary} />
            </Pressable>
          ),
          headerRight: () => (
            <View className="flex-row items-center">
              <Pressable
                onPress={() => {
                  setAutoRead(!autoRead);
                }}
                className="p-2"
                accessibilityLabel={t("a11y.autoRead")}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {autoRead ? (
                  <Volume2 size={24} color={theme.colors.primary} />
                ) : (
                  <VolumeX size={24} color={theme.colors.onSurfaceVariant} />
                )}
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname:
                      "/server/[serverId]/project/[projectId]/session/[sessionId]/settings",
                    params: { serverId: server.id, projectId, sessionId },
                  })
                }
                className="p-2"
                accessibilityLabel={t("a11y.sessionSettings")}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Settings size={24} color={theme.colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.colors.surface }}
        edges={["bottom"]}
      >
        <KeyboardAvoidingView
          behavior="translate-with-padding"
          className="flex-1"
          keyboardVerticalOffset={headerHeight}
        >
          <View
            className="flex-1"
            style={{ backgroundColor: theme.colors.surface }}
          >
            <FlatList
              ref={flatListRef}
              data={sortedMessages}
              keyExtractor={(item) => item.info.id}
              inverted={true}
              renderItem={renderMessage}
              onScroll={handleChatScroll}
              scrollEventThrottle={100}
              contentContainerStyle={{ padding: 16, flexGrow: 1 }}
              ListEmptyComponent={
                isLoading ? (
                  <BubbleSkeleton />
                ) : error ? (
                  <View className="flex-1 items-center justify-center p-4">
                    <Text
                      className="text-center"
                      style={{ color: theme.colors.error }}
                    >
                      {(error as Error).message}
                    </Text>
                  </View>
                ) : (
                  <EmptyState
                    kind="chat"
                    title={t("chat.emptyTitle")}
                    body={t("chat.emptyBody")}
                  />
                )
              }
            />

            {bannerPermissions.map((permission) => (
              <PermissionBanner
                key={permission.id}
                request={permission}
                server={server}
                directory={sessionDir || projectPath || undefined}
              />
            ))}

            {bannerForms.map((form) => (
              <FormBanner
                key={form.id}
                form={form}
                server={server}
              />
            ))}

            {newestRunError && !rescueMutation.isSuccess ? (
              <View
                className="mx-4 mb-2 flex-row items-center gap-2 px-4 py-3"
                style={{
                  backgroundColor: theme.colors.errorContainer,
                  borderRadius: 20,
                }}
                accessibilityLiveRegion="polite"
              >
                <Text
                  className="flex-1 text-xs"
                  style={{ color: theme.colors.onErrorContainer }}
                  numberOfLines={2}
                >
                  {t("sessionBusy.rescueMsg")}
                </Text>
                <Pressable
                  onPress={() => rescueMutation.mutate()}
                  disabled={rescueMutation.isPending}
                  className="flex-row items-center gap-1 px-3 py-1.5"
                  style={{
                    backgroundColor: theme.colors.error,
                    borderRadius: 999,
                    opacity: rescueMutation.isPending ? 0.5 : 1,
                  }}
                  accessibilityRole="button"
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: theme.colors.onError }}
                  >
                    {rescueMutation.isPending
                      ? t("sessionBusy.forking")
                      : t("sessionBusy.rescue")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {rescueMutation.error ? (
              <Text
                className="text-sm text-center px-4 pb-2"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {(rescueMutation.error as Error).message}
              </Text>
            ) : null}

            <MessageInput
              onSend={handleSend}
              disabled={sendMessageMutation.isPending}
              selectedAgent={selectedAgent}
              selectedModel={displayModel}
              server={server}
              projectPath={projectPath}
              usage={contextUsage}
              isBusy={sessionActive}
              stopping={abortMutation.isPending}
              onStop={() => abortMutation.mutate()}
            />
            {sendMessageMutation.error && (
              <Text
                className="text-sm text-center px-4 pb-2"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t("feedback.sendFailed")}
              </Text>
            )}
            {drawerOpen ? (
              <RecentSessionsDrawer
                currentSessionId={sessionId}
                onClose={() => setDrawerOpen(false)}
              />
            ) : null}
            {menuFor ? (
              <MessageActionMenu
                anchor={menuFor.anchor}
                speaking={speech.status === "playing"}
                loadingSpeech={speech.status === "loading"}
                sharing={sharing}
                copied={copied}
                onCopy={() => {
                  void handleCopy();
                }}
                onSelectText={handleSelectText}
                onSpeakToggle={handleSpeakToggle}
                onShare={() => {
                  void handleShare();
                }}
                onDismiss={() => setMenuFor(null)}
              />
            ) : null}
            {selectablePartId && !menuFor ? (
              <Pressable
                onPress={() => setSelectablePartId(null)}
                className="absolute flex-row items-center gap-1 px-3 py-2"
                style={{
                  top: 8,
                  right: 16,
                  backgroundColor: theme.colors.primaryContainer,
                  borderRadius: 999,
                }}
                accessibilityLabel={t("menu.done")}
                accessibilityRole="button"
              >
                <Check size={16} color={theme.colors.onPrimaryContainer} />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: theme.colors.onPrimaryContainer }}
                >
                  {t("menu.done")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
