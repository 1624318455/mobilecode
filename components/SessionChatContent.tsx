import type {
  AssistantMessage,
  FilePart,
  Message,
  Part,
  TextPart,
  UserMessage,
} from "@opencode-ai/sdk/v2";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Check, Clock, GitFork, Hourglass, Settings, Volume2, VolumeX } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  hasPoisonedHistory,
  setPendingDigest,
  takePendingDigest,
} from "@/lib/historyDigest";
import { PermissionBanner } from "@/components/PermissionBanner";
import { QuestionBanner } from "@/components/QuestionBanner";
import { useAgents } from "@/hooks/useAgents";
import { useModels } from "@/hooks/useModels";
import { usePermissions } from "@/hooks/usePermissions";
import { useProjects } from "@/hooks/useProjects";
import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { useQuestions } from "@/hooks/useQuestions";
import { useServerEvents } from "@/hooks/useServerEvents";
import { useSessionMessages } from "@/hooks/useSessionMessages";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { Identifier } from "@/lib/id";
import { createClient } from "@/lib/opencode-client";
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
  info: Message;
  parts: Part[];
  optimistic?: boolean;
};

// Error ids already rescued this app run: never show the rescue card for
// them again (prevents fork→fail→fork loops when returning to the page).
const rescuedErrorIds = new Set<string>();

type OutgoingApiPart =
  | { id: string; type: "text"; text: string }
  | {
      id: string;
      type: "file";
      mime: string;
      url: string;
      filename: string;
      source: {
        type: "file";
        path: string;
        text: { value: string; start: number; end: number };
      };
    };

// Slide-up + fade-in for the optimistic message only (server-confirmed
// items render without animation so history never re-animates).
const OptimisticEntering = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 28 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(280);

function buildApiParts(
  text: string,
  files: MentionedFile[],
  projectPath: string | undefined,
): OutgoingApiPart[] {
  const parts: OutgoingApiPart[] = [
    {
      id: Identifier.ascending("part"),
      type: "text",
      text,
    },
  ];

  for (const file of files) {
    const isAbsolute =
      file.path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file.path);
    const filePath = isAbsolute
      ? file.path
      : `${(projectPath || "").replace(/[\\/]+$/, "")}/${file.path}`;
    const filename = file.path.split("/").pop() || file.path;

    parts.push({
      id: Identifier.ascending("part"),
      type: "file",
      mime: "text/plain",
      url: `file://${filePath}`,
      filename,
      source: {
        type: "file",
        path: filePath,
        text: {
          value: `@${file.path}`,
          start: 0,
          end: file.path.length + 1,
        },
      },
    });
  }

  return parts;
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
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.get({
        sessionID: sessionId,
      });

      return result.data;
    },
  });

  const projectPath = resolveProjectPath(
    projectId,
    projects,
    session?.directory ||
      (session as { location?: { directory?: string } } | undefined)?.location
        ?.directory,
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
  const { data: pendingQuestions = [] } = useQuestions(
    server,
    sessionId,
    session?.directory || projectPath || undefined,
  );
  const { data: pendingPermissions = [] } = usePermissions(
    server,
    sessionId,
    session?.directory || projectPath || undefined,
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
    session?.directory || projectPath || undefined,
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

  const abortMutation = useMutation({
    mutationFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.abort({
        sessionID: sessionId,
        directory: projectPath,
      });

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", sessionId, "status"],
      });
      queryClient.invalidateQueries({
        queryKey: messagesKey,
      });
    },
  });

  const confirmAbort = useCallback(() => {
    Alert.alert(
      t("sessionBusy.abortTitle"),
      t("sessionBusy.abortMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("sessionBusy.abort"),
          style: "destructive",
          onPress: () => abortMutation.mutate(),
        },
      ],
    );
  }, [abortMutation, t]);

  const forkMutation = useMutation({
    mutationFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });

      if (historyPoisoned) {
        const created = await client.session.create({
          directory: projectPath,
        });

        if (created.error || !created.data) {
          throw created.error ?? new Error("Create failed");
        }

        setPendingDigest(
          created.data.id,
          buildHistoryDigest(sortedMessages, sessionTitle),
        );

        return created.data;
      }

      const result = await client.session.fork({
        sessionID: sessionId,
        directory: projectPath,
      });

      if (result.error || !result.data) {
        throw result.error ?? new Error("Fork failed");
      }

      return result.data;
    },
    onSuccess: (fork) => {
      queryClient.invalidateQueries({
        queryKey: aggregateQueryKey(server.url),
      });
      router.push(
        `/server/${server.id}/project/${projectId}/session/${fork.id}`,
      );
    },
  });

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
  // Timestamp of the last LIVE-observed retry status event for this
  // session. SSE events are live-only (no replay), so observing one is
  // positive proof the server reported a wait just now — unlike the
  // poll-derived entry, which is a write-only fossil the server never
  // clears. Superseded by anything newer (terminal/user/activity/idle).
  const liveRetryAtRef = useRef<number | null>(null);

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
              sessionID: sessionId,
              role: "assistant",
              time: { created: Date.now() },
              parentID: "",
              modelID: "",
              providerID: "",
              mode: "",
              agent: "",
              path: { cwd: "", root: "" },
              cost: 0,
              tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cache: { read: 0, write: 0 },
              },
            } satisfies AssistantMessage,
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
          const stub: TextPart = {
            id: b.partID,
            sessionID: sessionId,
            messageID: b.messageID,
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

  // SSE subscription (P1): millisecond-level invalidation for ask/permission
  // and message deltas. Polling hooks above stay as offline fallback.
  // The server scopes /event by directory and drops everything without a
  // match, so prefer the server-canonical session.directory over the
  // route-derived projectPath.
  useServerEvents(server, {
    directory: session?.directory || projectPath || undefined,
    onEvent: (event) => {
      if (event.type === "permission.asked" || event.type === "permission.replied") {
        if (event.properties.sessionID === sessionId) {
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
        event.type === "question.asked" ||
        event.type === "question.replied" ||
        event.type === "question.rejected"
      ) {
        if (event.properties.sessionID === sessionId) {
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "session", sessionId, "questions"],
          });
          queryClient.invalidateQueries({
            queryKey: ["server", server.url, "session", sessionId, "messages"],
          });
        }
        return;
      }

      // Streaming deltas: buffer + throttled cache patch (item 4),
      // NOT a full refetch per token.
      if (event.type === "message.part.delta") {
        const p = event.properties;

        if (p.sessionID === sessionId && p.field === "text" && p.delta) {
          queueDelta(p.messageID, p.partID, p.delta);
        }

        return;
      }

      if (event.type === "message.part.updated") {
        const part = event.properties.part;

        if (part.sessionID === sessionId) {
          pokeActivity();
          // Canonical snapshot wins: drop buffered deltas for this part,
          // then replace the whole part.
          deltaBufRef.current = deltaBufRef.current.filter(
            (b) => b.partID !== part.id,
          );
          queryClient.setQueryData<CachedMessage[]>(messagesKey, (old) => {
            if (!old) {
              return old;
            }

            return old.map((m) =>
              m.info.id === part.messageID
                ? {
                    ...m,
                    parts: m.parts.some((pp) => pp.id === part.id)
                      ? m.parts.map((pp) => (pp.id === part.id ? part : pp))
                      : [...m.parts, part],
                  }
                : m,
            );
          });
        }

        return;
      }

      if (event.type === "message.updated") {
        const info = event.properties.info;

        if (info.sessionID === sessionId) {
          pokeActivity();
          // finish set => stream over for this message: drop the cursor.
          if (info.role === "assistant" && info.finish != null) {
            clearStreaming(info.id);
          }

          queryClient.setQueryData<CachedMessage[]>(messagesKey, (old) => {
            if (!old || !old.some((m) => m.info.id === info.id)) {
              return old;
            }

            return old.map((m) =>
              m.info.id === info.id ? { ...m, info } : m,
            );
          });
        }

        return;
      }

      if (
        event.type === "message.removed" ||
        event.type === "message.part.removed"
      ) {
        queryClient.invalidateQueries({
          queryKey: messagesKey,
        });
        return;
      }

      if (event.type === "session.status" || event.type === "session.idle") {
        if (event.properties.sessionID === sessionId) {
          if (event.type === "session.status") {
            if (event.properties.status.type === "retry") {
              liveRetryAtRef.current = Date.now();
            } else {
              liveRetryAtRef.current = null;
            }

            if (
              event.properties.status.type === "busy" ||
              event.properties.status.type === "retry"
            ) {
              seenBusyRef.current = true;
            }
          } else {
            liveRetryAtRef.current = null;
          }

          if (
            event.type === "session.idle" ||
            (event.type === "session.status" &&
              event.properties.status.type === "idle")
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
        event.type === "session.updated" ||
        event.type === "session.deleted"
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

  // Poisoned history can never run again (server ignores fork cutoffs,
  // delete/summarize don't cleanse — all verified): skip the dead
  // full-fork hop and go straight to a fresh session carrying a digest.
  const historyPoisoned = useMemo(
    () => hasPoisonedHistory(sortedMessages),
    [sortedMessages],
  );

  // The bottom banner stack always shows every pending request, even
  // when the same request also renders inline in the message flow.
  // Hiding the banner on inline-match caused dead ends: when the tool
  // part arrived but the request list was still in flight (or IDs
  // mismatched), neither surface offered an answer UI and the session
  // looked stuck on "Busy". Duplicate UI is a minor cost; a missing
  // answer UI blocks the run, so banners stay authoritative.
  const bannerPermissions = pendingPermissions;
  const bannerQuestions = pendingQuestions;

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

    const err = newest.info.error as {
      name?: unknown;
      data?: { message?: unknown };
    };
    const haystack = `${typeof err.name === "string" ? err.name : ""} ${
      typeof err.data?.message === "string" ? err.data.message : ""
    }`;

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
          (p): p is Extract<Part, { type: "text" }> => p.type === "text",
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
      const files: MentionedFile[] = latestUser.parts
        .filter(
          (p): p is Extract<Part, { type: "file" }> => p.type === "file",
        )
        .map((p) => {
          const src = p.source;

          if (src && (src.type === "file" || src.type === "symbol")) {
            return { path: src.path };
          }

          return { path: p.url.replace(/^file:\/\//, "") };
        });
      const dir = session?.directory || projectPath || undefined;
      const client = createClient({
        baseUrl: server.url,
        directory: dir,
        username: server.username,
        password: server.password,
      });
      // A fork copies poisoned history verbatim and can never run (the
      // server ignores fork(messageID), Part.delete is a no-op, summarize
      // doesn't cleanse — all verified). So rescue always starts clean.
      const created = await client.session.create({ directory: dir });

      if (created.error || !created.data) {
        throw created.error ?? new Error("Create failed");
      }

      const newId = created.data.id;

      const prompt = await client.session.promptAsync({
        sessionID: newId,
        messageID: Identifier.ascending("message"),
        agent: selectedAgent,
        model: modelForSend,
        parts: buildApiParts(text, files, dir),
      });

      if (prompt.error) {
        throw prompt.error;
      }

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
      router.push(
        `/server/${server.id}/project/${projectId}/session/${newId}`,
      );
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

  const handleShare = useCallback(async () => {
    setSharing(true);

    try {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.share({
        sessionID: sessionId,
        directory: projectPath,
      });
      const url = result.data?.share?.url;

      if (!url) {
        throw new Error("No share url");
      }

      setMenuFor(null);
      await Share.share({ message: url });
    } catch {
      Alert.alert(t("menu.share"), t("menu.shareFailed"));
    } finally {
      setSharing(false);
    }
  }, [projectPath, server.password, server.url, server.username, sessionId, t]);

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
          pendingQuestions={pendingQuestions}
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
    [server, pendingQuestions, pendingPermissions, selectablePartId, handleLongPressText, streamingIds, sessionActive],
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
  const currentModel =
    latestUserMessage?.info.role === "user"
      ? {
          modelID: latestUserMessage.info.model.modelID,
          providerID: latestUserMessage.info.model.providerID,
        }
      : {
          modelID: "big-pickle",
          providerID: "opencode",
        };

  // Track the latest user message by id: whenever a NEWER user message
  // arrives (initial load finishing late, or a just-sent message), sync the
  // agent/model pickers from it. A user override made through the picker
  // survives because the message id does not change underneath it.
  // Sessions with no user message yet fall back to the first model so the
  // picker never renders empty.
  const appliedMessageId = useRef<string | null>(null);
  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    if (
      !latestUserMessage ||
      latestUserMessage.info.role !== "user" ||
      latestUserMessage.info.id === appliedMessageId.current
    ) {
      if (!latestUserMessage && appliedMessageId.current !== "none") {
        if (!selectedModel) {
          setSelectedModel(models[0]);
        }

        appliedMessageId.current = "none";
      }

      return;
    }

    const agentFromMessage = latestUserMessage.info.agent;

    if (
      agentFromMessage &&
      agents.some((a) => a.name === agentFromMessage)
    ) {
      setSelectedAgent(agentFromMessage);
    }

    if (models.length > 0) {
      const matchFromMessage = models.find(
        (m) =>
          m.id === currentModel.modelID &&
          m.providerID === currentModel.providerID,
      );

      setSelectedModel(matchFromMessage || models[0]);
    }

    appliedMessageId.current = latestUserMessage.info.id;
  }, [
    agents,
    currentModel.modelID,
    currentModel.providerID,
    latestUserMessage,
    models,
    selectedModel,
    setSelectedAgent,
    setSelectedModel,
  ]);

  const modelForSend = selectedModel
    ? { modelID: selectedModel.id, providerID: selectedModel.providerID }
    : currentModel;

  // What the chip shows: prefer the picked model, but fall back to the model
  // recorded on the latest user message so the name is correct on first paint
  // instead of waiting for the provider catalog.
  const displayModel =
    selectedModel ||
    (latestUserMessage?.info.role === "user"
      ? {
          id: latestUserMessage.info.model.modelID,
          providerID: latestUserMessage.info.model.providerID,
          name: latestUserMessage.info.model.modelID,
        }
      : undefined);

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      messageID,
      apiParts,
    }: {
      messageID: string;
      apiParts: OutgoingApiPart[];
    }) => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });

      const result = await client.session.promptAsync({
        sessionID: sessionId,
        messageID,
        agent: selectedAgent,
        model: modelForSend,
        parts: apiParts,
      });

      // Surface server rejections (e.g. locked session) through onError
      // instead of silently succeeding with no data.
      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    // Optimistic insert: the message appears instantly (with slide-up +
    // fade-in) instead of waiting seconds for the server round-trip.
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const prev = queryClient.getQueryData<CachedMessage[]>(messagesKey);

      const cacheParts: Part[] = variables.apiParts.map((p) =>
        p.type === "text"
          ? ({
              id: p.id,
              sessionID: sessionId,
              messageID: variables.messageID,
              type: "text",
              text: p.text,
            } satisfies TextPart)
          : ({
              id: p.id,
              sessionID: sessionId,
              messageID: variables.messageID,
              type: "file",
              mime: p.mime,
              url: p.url,
              filename: p.filename,
              source: p.source,
            } satisfies FilePart),
      );
      const optimistic: CachedMessage = {
        info: {
          id: variables.messageID,
          sessionID: sessionId,
          role: "user",
          time: { created: Date.now() },
          agent: selectedAgent,
          model: modelForSend,
        } satisfies UserMessage,
        parts: cacheParts,
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
        apiParts: buildApiParts(finalText, files, projectPath),
      });
    },
    [projectPath, sendMessageMutation, sessionId],
  );

  // Retry bar visibility, evidence-based only — a fossil record never
  // clears server-side, so the ENTRY alone proves nothing:
  // - live retry event observed just now (SSE is live-only): show, unless
  //   something newer already superseded it (terminal/user/activity/idle);
  // - user message sent >60s ago with zero activity since: the fresh run
  //   might genuinely be queuing behind quota — show (self-clears on any
  //   progress or completion).
  // Everything else (quiet fossil, working run, finished tail) hides.
  const newestIsUser = newestMessage?.info.role === "user";
  const newestCreated = newestMessage?.info.time.created ?? 0;
  const newestTerminal =
    newestMessage?.info.role === "assistant" &&
    newestMessage.info.finish != null;
  const liveRetry = liveRetryAtRef.current;
  const liveRetryValid =
    liveRetry != null &&
    !(newestTerminal && newestCreated > liveRetry) &&
    !(newestIsUser && newestCreated > liveRetry) &&
    !(activityAtRef.current > liveRetry);
  const stalledFreshRun =
    !!newestIsUser &&
    Date.now() - newestCreated > 60000 &&
    activityAtRef.current <= newestCreated;
  const showRetryBar =
    sessionRun?.state === "retry" &&
    !newestTerminal &&
    (liveRetryValid || stalledFreshRun);

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
                  router.push(
                    `/server/${server.id}/project/${projectId}/session/${sessionId}/settings`,
                  )
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
                directory={session?.directory || projectPath || undefined}
              />
            ))}

            {bannerQuestions.map((question) => (
              <QuestionBanner
                key={question.id}
                request={question}
                server={server}
                directory={session?.directory || projectPath || undefined}
              />
            ))}

            {/* Retry bar only on evidence (see showRetryBar): a fossil
                record alone never cries quota. Busy still shows whenever
                non-idle (its own stuck rule already converged it). */}
            {sessionBusy !== "idle" &&
            (sessionRun?.state !== "retry" || showRetryBar) ? (
              <View
                className="mx-4 mb-2 flex-row items-center gap-2 px-4 py-3"
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: theme.colors.outlineVariant,
                }}
                accessibilityLiveRegion="polite"
              >
                <Hourglass size={16} color={theme.colors.onSecondaryContainer} />
                <Text
                  className="flex-1 text-xs"
                  style={{ color: theme.colors.onSecondaryContainer }}
                >
                  {sessionRun?.state === "retry" && sessionRun.message
                    ? sessionRun.next
                      ? `${sessionRun.message} ${t("sessionBusy.retryNext", {
                          t: new Date(sessionRun.next).toLocaleTimeString(),
                        })}`
                      : sessionRun.message
                    : t("sessionBusy.busy")}
                </Text>
                <Pressable
                  onPress={() => forkMutation.mutate()}
                  disabled={forkMutation.isPending}
                  className="flex-row items-center gap-1 px-3 py-1.5"
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 999,
                    opacity: forkMutation.isPending ? 0.5 : 1,
                  }}
                  accessibilityRole="button"
                >
                  <GitFork size={14} color={theme.colors.onPrimary} />
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: theme.colors.onPrimary }}
                  >
                    {forkMutation.isPending
                      ? t("sessionBusy.forking")
                      : historyPoisoned
                        ? t("sessionBusy.fresh")
                        : t("sessionBusy.fork")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirmAbort}
                  disabled={abortMutation.isPending}
                  className="items-center px-3 py-1.5"
                  style={{
                    borderColor: theme.colors.outline,
                    borderRadius: 999,
                    borderWidth: 1,
                    opacity: abortMutation.isPending ? 0.5 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("sessionBusy.abort")}
                >
                  <Text
                    className="text-xs"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {abortMutation.isPending
                      ? t("sessionBusy.aborting")
                      : t("sessionBusy.abort")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {forkMutation.error ? (
              <Text
                className="text-sm text-center px-4 pb-2"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {(forkMutation.error as Error).message}
              </Text>
            ) : null}
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
