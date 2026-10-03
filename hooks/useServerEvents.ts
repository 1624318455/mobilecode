import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { subscribeServerEvents } from "@/lib/serverEvents";
import type { Event } from "@/lib/serverEvents";
import { Server } from "@/stores";
import { useSseStore } from "@/stores/sse";

export interface ServerEventsHandlers {
  directory?: string;
  workspace?: string;
  enabled?: boolean;
  onEvent: (event: Event) => void;
  onError?: (error: unknown) => void;
}

export function useServerEvents(server: Server, handlers: ServerEventsHandlers) {
  const onEventRef = useRef(handlers.onEvent);
  const onErrorRef = useRef(handlers.onError);

  onEventRef.current = handlers.onEvent;
  onErrorRef.current = handlers.onError;

  const { directory, workspace, enabled = true } = handlers;
  const mark = useSseStore((s) => s.mark);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let appStateSub: { remove: () => void } | null = null;

    function start() {
      if (unsubscribe) {
        unsubscribe();
      }

      mark(server.url, { state: "connecting" });
      unsubscribe = subscribeServerEvents(server, {
        directory,
        workspace,
        onError: (error: unknown) => {
          mark(server.url, {
            state: "error",
            errors: (useSseStore.getState().byUrl[server.url]?.errors ?? 0) + 1,
          });
          onErrorRef.current?.(error);
        },
        onEvent: (event: Event) => {
          mark(server.url, { state: "live", lastEventAt: Date.now() });
          onEventRef.current(event);
        },
      });
    }

    function stop() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      mark(server.url, { state: "off" });
    }

    start();

    appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        start();
      } else if (state === "background") {
        stop();
      }
    });

    return () => {
      stop();
      appStateSub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, server.url, directory, workspace, enabled]);
}
