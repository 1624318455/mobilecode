import type { OpenCodeEvent } from "@opencode/client";

import { rnStreamingFetch } from "@/lib/rnSseFetch";
import type { Server } from "@/stores";

export type Event = OpenCodeEvent;

export interface ServerEventSubscribeOptions {
  directory?: string;
  workspace?: string;
  onEvent: (event: Event) => void;
  onError?: (error: unknown) => void;
}

function isStreamEvent(data: unknown): data is Event {
  if (!data || typeof data !== "object") {
    return false;
  }

  return typeof (data as { type?: unknown }).type === "string";
}

// v2 /api/event is a global firehose (no directory scoping): every
// subscriber filters by sessionID itself. Frames are parsed by hand
// because RN fetch() cannot stream bodies — rnStreamingFetch yields raw
// text chunks via the same reader surface the old SDK used.
export function subscribeServerEvents(
  server: Server,
  options: ServerEventSubscribeOptions,
): () => void {
  let cancelled = false;
  const aborter = new AbortController();

  async function pump(): Promise<void> {
    const headers: Record<string, string> = { Accept: "text/event-stream" };

    if (server.username || server.password) {
      headers["Authorization"] =
        `Basic ${btoa(`${server.username || ""}:${server.password || ""}`)}`;
    }

    let response: Response;

    try {
      response = await rnStreamingFetch(
        `${server.url.replace(/\/$/, "")}/api/event`,
        { headers, signal: aborter.signal },
      );
    } catch (error) {
      if (!cancelled) {
        options.onError?.(error);
      }

      return;
    }

    if (!response.ok) {
      if (!cancelled) {
        options.onError?.(new Error(`Event stream failed: ${response.status}`));
      }

      return;
    }

    const reader = (
      response.body as unknown as {
        pipeThrough: (through: unknown) => { getReader: () => {
          read: () => Promise<{ done: boolean; value: string }>;
        } };
      }
    )
      .pipeThrough({})
      .getReader();

    let buffer = "";

    function dispatch(frame: string): void {
      const lines = frame.split("\n");
      const payload: string[] = [];

      for (const line of lines) {
        if (line.startsWith("data:")) {
          payload.push(line.slice(5).trimStart());
        }
      }

      if (payload.length === 0) {
        return;
      }

      try {
        const data: unknown = JSON.parse(payload.join("\n"));

        if (!cancelled && isStreamEvent(data)) {
          options.onEvent(data);
        }
      } catch {
        // Truncated frame; the next chunk completes it.
      }
    }

    try {
      for (;;) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        buffer += chunk.value;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          if (cancelled) {
            return;
          }

          dispatch(frame);
        }
      }
    } catch (error) {
      if (!cancelled) {
        options.onError?.(error);
      }
    }
  }

  void pump();

  return () => {
    cancelled = true;
    aborter.abort();
  };
}
