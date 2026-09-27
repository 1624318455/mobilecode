import * as Crypto from "expo-crypto";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "1-143.0.3650.75";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

export const EDGE_TTS_VOICE = "zh-CN-XiaoxiaoNeural";
export const EDGE_TTS_MAX_CHARS = 4000;

export class EdgeTtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EdgeTtsError";
  }
}

function randomHex(bytes: number): string {
  const chars = "0123456789abcdef";
  const buf = Crypto.getRandomBytes(bytes);
  let out = "";

  for (let i = 0; i < buf.length; i++) {
    const b = buf[i] as number;
    out += chars[(b >> 4) & 0xf] + chars[b & 0xf];
  }

  return out;
}

// Sec-MS-GEC = UPPER(SHA256("<winfiletime-rounded-5min><token>")).
// BigInt: filetime (~1.3e17) exceeds double precision.
async function secMsGec(): Promise<string> {
  const unix = BigInt(Math.floor(Date.now() / 1000));
  let ticks = unix + BigInt(11644473600);
  ticks -= ticks % BigInt(300);
  const filetime = ticks * BigInt(10000000);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    filetime.toString() + TRUSTED_CLIENT_TOKEN,
  );

  return digest.toUpperCase();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsDateString(): string {
  return new Date().toString();
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof (blob as Blob & { arrayBuffer?: unknown }).arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }

  return out;
}

export interface EdgeTtsRequest {
  text: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  timeoutMs?: number;
}

// Minimal Edge readaloud client (mirrors the official edge-tts wire format).
// Resolves with raw mp3 bytes once the server sends turn.end.
export function synthesizeEdgeTts(request: EdgeTtsRequest): Promise<Uint8Array> {
  const voice = request.voice ?? EDGE_TTS_VOICE;
  const text = request.text.slice(0, EDGE_TTS_MAX_CHARS);
  const timeoutMs = request.timeoutMs ?? 30000;

  return (async () => {
    const connectionId = randomHex(16);
    const url =
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}` +
      `&Sec-MS-GEC=${await secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;
      const chunks: Uint8Array[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;

      const done = (fn: () => void) => {
        if (settled) {
          return;
        }

        settled = true;

        if (timer) {
          clearTimeout(timer);
        }

        try {
          ws.close();
        } catch {
          // Already closed; ignore.
        }

        fn();
      };

      // React Native's WebSocket accepts a third options arg (headers);
      // DOM types only know (url, protocols), so cast the constructor.
      type RNWebSocketCtor = new (
        url: string,
        protocols?: string[],
        options?: WebSocketOptions,
      ) => WebSocket;
      let ws: WebSocket;
      try {
        ws = new (WebSocket as unknown as RNWebSocketCtor)(url, [], {
          headers: {
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
            Origin: ORIGIN,
            "User-Agent": CHROME_UA,
          },
        });
      } catch (error) {
        reject(
          error instanceof Error ? error : new EdgeTtsError("WS construct failed"),
        );

        return;
      }

      try {
        (ws as unknown as { binaryType: string }).binaryType = "arraybuffer";
      } catch {
        // binaryType unsupported; Blob fallback in onmessage covers it.
      }

      timer = setTimeout(() => {
        done(() => reject(new EdgeTtsError("Timed out waiting for audio")));
      }, timeoutMs);

      ws.onopen = () => {
        const config =
          `X-Timestamp:${jsDateString()}Z\r\n` +
          "Content-Type:application/json; charset=utf-8\r\n" +
          "Path:speech.config\r\n\r\n" +
          '{"context":{"synthesis":{"audio":{"metadataoptions":' +
          '{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
          '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}';
        ws.send(config);

        const requestId = randomHex(16);
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
          `<voice name='${voice}'><prosody pitch='${request.pitch ?? "+0Hz"}' ` +
          `rate='${request.rate ?? "+0%"}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
        ws.send(
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\n` +
            `X-Timestamp:${jsDateString()}Z\r\nPath:ssml\r\n\r\n${ssml}`,
        );
      };

      ws.onmessage = (evt) => {
        const data = (evt as MessageEvent).data as unknown;

        if (typeof data === "string") {
          if (data.includes("Path:turn.end")) {
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const out = new Uint8Array(total);
            let offset = 0;

            for (const c of chunks) {
              out.set(c, offset);
              offset += c.length;
            }

            done(() => {
              if (out.length === 0) {
                reject(new EdgeTtsError("Empty audio"));
              } else {
                resolve(out);
              }
            });
          }

          return;
        }

        const handleBytes = (bytes: Uint8Array) => {
          if (bytes.length < 2) {
            return;
          }

          const headerLen = (bytes[0] as number) * 256 + (bytes[1] as number);
          chunks.push(bytes.subarray(2 + headerLen));
        };

        if (data instanceof ArrayBuffer) {
          handleBytes(new Uint8Array(data));
        } else if (typeof Blob !== "undefined" && data instanceof Blob) {
          blobToBytes(data).then(handleBytes).catch(() => {
            // Drop undecodable chunk; turn.end still resolves.
          });
        }
      };

      ws.onerror = () => {
        done(() => reject(new EdgeTtsError("Connection failed")));
      };
    });
  })();
}

type WebSocketOptions = { headers?: Record<string, string> };

// Strip markdown formatting so the voice doesn't read symbols aloud.
export function toSpeakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(`{1,3})([^`]*)\1/g, "$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^(\s*[-*+]|\s*\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function edgeTtsBytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";

  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    bin += String.fromCharCode(...slice);
  }

  return btoa(bin);
}
