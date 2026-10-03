import { OpenCode } from "@opencode/client";

interface V2ClientOptions {
  baseUrl: string;
  username?: string;
  password?: string;
}

export function createV2Client(options: V2ClientOptions) {
  const headers: Record<string, string> = {};

  if (options.username || options.password) {
    const credentials = `${options.username || ""}:${options.password || ""}`;
    headers["Authorization"] = `Basic ${btoa(credentials)}`;
  }

  return OpenCode.make({
    baseUrl: options.baseUrl.replace(/\/$/, ""),
    headers,
  });
}

export type V2Client = ReturnType<typeof OpenCode.make>;
