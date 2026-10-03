import type { SessionMessageInfo } from "@opencode/client";

export interface ChatTextPart {
  id: string;
  type: "text";
  text: string;
}

export interface ChatFilePart {
  id: string;
  type: "file";
  filename?: string;
  url: string;
}

export interface ChatReasoningPart {
  id: string;
  type: "reasoning";
  text: string;
}

export type ChatToolStatus = "pending" | "running" | "completed" | "error";

export interface ChatToolState {
  status: ChatToolStatus;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  title?: string;
}

export interface ChatToolPart {
  id: string;
  type: "tool";
  tool: string;
  callID: string;
  messageID: string;
  state: ChatToolState;
}

export type ChatPart =
  | ChatTextPart
  | ChatFilePart
  | ChatReasoningPart
  | ChatToolPart;

export interface ChatInfo {
  id: string;
  role: "user" | "assistant";
  time: { created: number };
  finish?: string | null;
  error?: { name: string; message?: string } | null;
  model?: { modelID: string; providerID: string };
  agent?: string;
}

export interface ChatItem {
  info: ChatInfo;
  parts: ChatPart[];
}

function toolOutputText(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const texts: string[] = [];

  for (const entry of content) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      (entry as { type?: unknown }).type === "text" &&
      typeof (entry as { text?: unknown }).text === "string"
    ) {
      texts.push((entry as { text: string }).text);
    }
  }

  if (texts.length === 0) {
    return undefined;
  }

  return texts.join("\n");
}

function toToolPart(
  messageId: string,
  tool: Extract<SessionMessageInfo, { type: "assistant" }>["content"][number] & {
    type: "tool";
  },
): ChatToolPart {
  const state = tool.state;

  if (state.status === "streaming") {
    return {
      id: tool.id,
      type: "tool",
      tool: tool.name,
      callID: tool.id,
      messageID: messageId,
      state: { status: "running", input: {}, title: state.input },
    };
  }

  if (state.status === "running") {
    return {
      id: tool.id,
      type: "tool",
      tool: tool.name,
      callID: tool.id,
      messageID: messageId,
      state: {
        status: "running",
        input: (state.input ?? {}) as Record<string, unknown>,
        metadata: state.metadata as Record<string, unknown> | undefined,
      },
    };
  }

  if (state.status === "completed") {
    return {
      id: tool.id,
      type: "tool",
      tool: tool.name,
      callID: tool.id,
      messageID: messageId,
      state: {
        status: "completed",
        input: (state.input ?? {}) as Record<string, unknown>,
        output: toolOutputText(state.content),
        metadata: state.metadata as Record<string, unknown> | undefined,
      },
    };
  }

  return {
    id: tool.id,
    type: "tool",
    tool: tool.name,
    callID: tool.id,
    messageID: messageId,
    state: {
      status: "error",
      input: (state.input ?? {}) as Record<string, unknown>,
      output: toolOutputText(state.content),
      error: state.error.message,
      metadata: state.metadata as Record<string, unknown> | undefined,
    },
  };
}

// v2 messages are a flat tagged union; the chat UI works on
// `{ info, parts[] }`. Non-conversational items (compaction records,
// switch markers, idle, shell, skill, system, synthetic) are dropped —
// the transcript shows user prompts and assistant replies.
export function normalizeV2Messages(
  messages: SessionMessageInfo[],
): ChatItem[] {
  const out: ChatItem[] = [];

  for (const message of messages) {
    if (message.type === "user") {
      const parts: ChatPart[] = [
        { id: `${message.id}-text`, type: "text", text: message.text },
      ];

      out.push({
        info: {
          id: message.id,
          role: "user",
          time: { created: message.time.created },
        },
        parts,
      });
      continue;
    }

    if (message.type === "assistant") {
      const parts: ChatPart[] = [];

      for (const content of message.content) {
        if (content.type === "text") {
          parts.push({ id: `${message.id}-${parts.length}`, type: "text", text: content.text });
        } else if (content.type === "reasoning") {
          parts.push({ id: `${message.id}-${parts.length}`, type: "reasoning", text: content.text });
        } else {
          parts.push(toToolPart(message.id, content));
        }
      }

      out.push({
        info: {
          id: message.id,
          role: "assistant",
          time: { created: message.time.created },
          finish: message.finish ?? null,
          error: message.error
            ? { name: message.error.type, message: message.error.message }
            : null,
          model: message.model
            ? { modelID: message.model.id, providerID: message.model.providerID }
            : undefined,
          agent: message.agent,
        },
        parts,
      });
    }
  }

  return out;
}
