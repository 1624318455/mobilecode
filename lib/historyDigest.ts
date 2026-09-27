import type { Message, Part } from "@opencode-ai/sdk/v2";

export interface DigestSource {
  info: Message;
  parts: Part[];
}

interface ReasoningMetadata {
  openai?: {
    reasoningEncryptedContent?: unknown;
  };
}

// A "poisoned" part carries encrypted reasoning bound to another caller.
// Replaying it in a new run makes the provider reject the whole run.
export function isPoisonedPart(part: Part): boolean {
  if (part.type !== "reasoning") {
    return false;
  }

  const metadata = part.metadata as ReasoningMetadata | undefined;
  const encrypted = metadata?.openai?.reasoningEncryptedContent;

  return typeof encrypted === "string" && encrypted.length > 0;
}

const MAX_MESSAGES = 40;
const MAX_PER_TEXT = 500;
const MAX_TOTAL_CHARS = 4000;

function textOf(parts: Part[]): string {
  const out: string[] = [];

  for (const part of parts) {
    // Text only: reasoning parts may carry encrypted blobs bound to another
    // caller, tool parts are noise — neither is safe nor useful as context.
    if (part.type === "text" && part.text && part.text.trim()) {
      const clipped = part.text.trim();

      out.push(
        clipped.length > MAX_PER_TEXT
          ? clipped.slice(0, MAX_PER_TEXT) + "…"
          : clipped,
      );
    }
  }

  return out.join("\n");
}

// Extractive digest of recent conversation for carrying context into a
// fresh session. Newest-first input, oldest-first output, capped.
export function buildHistoryDigest(
  newestFirst: DigestSource[],
  sessionTitle: string,
): string {
  const lines: string[] = [];
  let total = 0;
  let count = 0;

  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const msg = newestFirst[i] as DigestSource | undefined;

    if (!msg) {
      continue;
    }

    const text = textOf(msg.parts);

    if (!text) {
      continue;
    }

    const who = msg.info.role === "user" ? "用户" : "助手";
    const line = `${who}：${text}`;

    if (total + line.length > MAX_TOTAL_CHARS || count >= MAX_MESSAGES) {
      break;
    }

    total += line.length;
    count += 1;
    lines.push(line);
  }

  if (lines.length === 0) {
    return "";
  }

  return `【历史摘要：来自会话“${sessionTitle}”，仅作背景参考】\n${lines.join("\n")}`;
}

// The rescued user message: digest (if any) + current question in ONE
// prompt so it costs a single run.
export const QUESTION_MARKER = "\n\n【当前问题】\n";

export function buildRescueText(digest: string, question: string): string {
  if (!digest) {
    return question;
  }

  return `${digest}${QUESTION_MARKER}${question}`;
}

// Split a carried message back into digest + question for display: the
// digest collapses, the question renders normally.
export function splitCarriedText(text: string): {
  digest: string;
  question: string;
} | null {
  const idx = text.indexOf(QUESTION_MARKER);

  if (idx < 0) {
    return null;
  }

  return {
    digest: text.slice(0, idx),
    question: text.slice(idx + QUESTION_MARKER.length),
  };
}

// Whether any message carries poison (encrypted reasoning bound to another
// caller). Used to decide fork-full vs fresh-session.
export function hasPoisonedHistory(newestFirst: DigestSource[]): boolean {
  for (const msg of newestFirst) {
    if (!msg) {
      continue;
    }

    for (const part of msg.parts) {
      if (isPoisonedPart(part)) {
        return true;
      }
    }
  }

  return false;
}

// Pending digests staged for a session's FIRST send (consumed once).
// Lets a fresh session carry context without spending an extra run.
const pendingDigests = new Map<string, string>();

export function setPendingDigest(sessionId: string, digest: string): void {
  if (digest) {
    pendingDigests.set(sessionId, digest);
  }
}

export function takePendingDigest(sessionId: string): string | null {
  const digest = pendingDigests.get(sessionId) ?? null;
  pendingDigests.delete(sessionId);

  return digest;
}
