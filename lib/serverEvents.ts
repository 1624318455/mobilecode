import type { Event } from "@opencode-ai/sdk/v2";

import { createClient } from "@/lib/opencode-client";
import { rnStreamingFetch } from "@/lib/rnSseFetch";
import type { Server } from "@/stores";

export type { Event };

export interface ServerEventSubscribeOptions {
  directory?: string;
  workspace?: string;
  onEvent: (event: Event) => void;
  onError?: (error: unknown) => void;
}

function normalizeStreamData(data: unknown): Event | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const candidate = data as { type?: unknown };

  if (typeof candidate.type !== "string") {
    return null;
  }

  return data as Event;
}

export function subscribeServerEvents(
  server: Server,
  options: ServerEventSubscribeOptions,
): () => void {
  let cancelled = false;
  const aborter = new AbortController();

  async function pump(): Promise<void> {
    const client = createClient({
      baseUrl: server.url,
      directory: options.directory,
      username: server.username,
      password: server.password,
    });

    try {
      const result = await client.event.subscribe(
        {
          directory: options.directory,
          workspace: options.workspace,
        },
        {
          onSseError: (error: unknown) => {
            if (!cancelled) {
              options.onError?.(error);
            }
          },
          onSseEvent: (streamEvent: { data: unknown }) => {
            if (cancelled) {
              return;
            }

            const normalized = normalizeStreamData(streamEvent.data);

            if (normalized) {
              options.onEvent(normalized);
            }
          },
          // RN fetch() cannot stream bodies: inject the XHR transport or
          // the SDK hangs forever and no event is ever delivered.
          fetch: rnStreamingFetch,
          signal: aborter.signal,
        },
      );

      for await (const data of result.stream) {
        if (cancelled) {
          break;
        }

        const normalized = normalizeStreamData(data);

        if (normalized) {
          // onSseEvent already delivered this event; the drained stream
          // only keeps the connection alive, so skip double handling here.
          // Intentionally empty: see onSseEvent above.
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
