// React Native's fetch() cannot stream response bodies (Response.body
// is null and TextDecoderStream is missing), so the SDK's fetch-reader SSE
// transport would hang forever and never deliver events. Everything the app
// received until now came from polling.
//
// This minimal XHR-based fetch implements just the surface the SDK's SSE
// client uses: status/ok/headers plus a body whose pipeThrough() yields
// string chunks as they arrive via XHR onprogress. Crucially the promise
// resolves at HEADERS_RECEIVED (like real fetch), NOT at load completion,
// otherwise an infinite SSE stream would never start delivering.

// The SDK evaluates `new TextDecoderStream()` and hands it to
// body.pipeThrough(). Our transport ignores that argument, but Hermes has
// no such global, so install a dummy constructor to avoid ReferenceError.
const globals = globalThis as unknown as Record<string, unknown>;

if (typeof globals.TextDecoderStream === "undefined") {
  globals.TextDecoderStream = class {
    constructor(..._args: Array<unknown>) {}
  };
}

interface ChunkReader {
  read(): Promise<{ done: boolean; value: string }>;
  cancel(): void;
  releaseLock(): void;
}

function headersToPairs(headers: HeadersInit | undefined): Array<[string, string]> {
  if (!headers) {
    return [];
  }

  if (headers instanceof Headers) {
    const out: Array<[string, string]> = [];
    headers.forEach((value, key) => {
      out.push([key, value]);
    });

    return out;
  }

  if (Array.isArray(headers)) {
    return headers as Array<[string, string]>;
  }

  return Object.entries(headers);
}

function parseResponseHeaders(raw: string): Headers {
  const headers = new Headers();
  const lines = raw.split("\r\n");

  for (const line of lines) {
    const idx = line.indexOf(":");

    if (idx > 0) {
      headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    }
  }

  return headers;
}

export function rnStreamingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let url: string;
    let method = "GET";
    let headerPairs: Array<[string, string]> = [];
    let body: BodyInit | null | undefined;
    let signal: AbortSignal | null | undefined;

    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else {
      url = input.url;
      method = input.method || "GET";
      headerPairs = headersToPairs(input.headers as HeadersInit);
    }

    if (init) {
      if (init.method) {
        method = init.method;
      }

      if (init.headers) {
        headerPairs = headersToPairs(init.headers);
      }

      body = init.body;
      signal = init.signal;
    }

    if (signal?.aborted) {
      reject(new Error("aborted"));

      return;
    }

    // Chunk queue feeding the SDK's reader.read() loop.
    const queue: string[] = [];
    let closed = false;
    let failure: unknown = null;
    let notify: (() => void) | null = null;
    const reader: ChunkReader = {
      read() {
        if (queue.length > 0) {
          return Promise.resolve({ done: false, value: queue.shift() as string });
        }

        if (failure) {
          return Promise.reject(failure);
        }

        if (closed) {
          return Promise.resolve({ done: true, value: "" });
        }

        return new Promise<{ done: boolean; value: string }>((res, rej) => {
          notify = () => {
            if (queue.length > 0) {
              res({ done: false, value: queue.shift() as string });
            } else if (failure) {
              rej(failure);
            } else if (closed) {
              res({ done: true, value: "" });
            }
          };
        });
      },
      cancel() {
        try {
          xhr.abort();
        } catch {
          // Already gone; ignore.
        }
      },
      releaseLock() {},
    };
    const push = (chunk: string) => {
      if (!chunk) {
        return;
      }

      queue.push(chunk);

      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    };
    const finish = (error?: unknown) => {
      if (error) {
        failure = error;
      } else {
        closed = true;
      }

      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    };

    const xhr = new XMLHttpRequest();
    let settled = false;
    xhr.open(method, url, true);

    for (const [key, value] of headerPairs) {
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        // Forbidden headers (Host, Content-Length, ...): skip.
      }
    }

    let lastLen = 0;
    const drain = () => {
      const text = xhr.responseText ?? "";

      if (text.length > lastLen) {
        push(text.slice(lastLen));
        lastLen = text.length;
      }
    };

    xhr.onreadystatechange = () => {
      // HEADERS_RECEIVED: resolve like fetch does (headers only).
      if (xhr.readyState === 2 && !settled) {
        settled = true;
        const response = {
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
          url,
          body: {
            pipeThrough: () => ({ getReader: () => reader }),
          },
        };

        resolve(response as unknown as Response);
      }
    };
    xhr.onprogress = () => {
      drain();
    };
    xhr.onload = () => {
      drain();
      finish();
    };
    xhr.onerror = () => {
      finish(new Error("SSE stream failed"));
    };
    xhr.ontimeout = () => {
      finish(new Error("SSE stream timed out"));
    };
    signal?.addEventListener("abort", () => {
      try {
        xhr.abort();
      } catch {
        // Already gone; ignore.
      }

      const error = new Error("aborted");
      finish(error);

      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    try {
      xhr.send((body as string | null) ?? null);
    } catch (error) {
      finish(error);

      if (!settled) {
        settled = true;
        reject(error instanceof Error ? error : new Error("SSE send failed"));
      }
    }
  });
}
