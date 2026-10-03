import { memo } from "react";
import { Text, View } from "react-native";
import type { PermissionRequest } from "@opencode/client";

import { ChatMessagePart, PartLongPress } from "./ChatMessagePart";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import type { ChatItem } from "@/lib/v2messages";
import { Server } from "@/stores";
import { TypingDots } from "./TypingDots";

interface ChatMessageProps {
  message: ChatItem;
  server?: Server;
  pendingPermissions?: PermissionRequest[];
  selectablePartId?: string | null;
  onLongPressText?: (info: PartLongPress) => void;
  isStreaming?: boolean;
  sessionActive?: boolean;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  server,
  pendingPermissions,
  selectablePartId,
  onLongPressText,
  isStreaming = false,
  sessionActive = true,
}: ChatMessageProps) {
  const theme = useAppTheme();
  const isUser = message.info.role === "user";
  const isAssistantTyping =
    message.info.role === "assistant" && !message.info.finish;
  // A run that dies without a finish flag would otherwise spin the dots
  // forever: only show them while the session is actually running, or the
  // message is brand new (covers status poll lag).
  const showTyping =
    isAssistantTyping &&
    (sessionActive ||
      Date.now() - message.info.time.created < 60000);

  if (
    message.info.role === "assistant" &&
    message.info.error &&
    message.parts.length === 0
  ) {
    return (
      <View className="mb-4 items-start">
        <View
          className="max-w-[80%] px-4 py-3"
          style={{
            backgroundColor: theme.colors.errorContainer,
            borderRadius: 28,
          }}
        >
          <View>
            <Text
              className="text-base font-semibold mb-1"
              style={{ color: theme.colors.onErrorContainer }}
            >
              {message.info.error.name}
            </Text>
            {typeof message.info.error.message === "string" && (
              <Text
                className="text-sm"
                style={{ color: theme.colors.onErrorContainer }}
              >
                {message.info.error.message}
              </Text>
            )}
          </View>
        </View>
      </View>
      );
    }

  return (
    <View className={`mb-4 ${isUser ? "items-end" : "items-start"}`}>
      {message.parts.map((part, index) => (
        <ChatMessagePart
          key={part.id ?? index}
          part={part}
          isUser={isUser}
          server={server}
          pendingPermissions={pendingPermissions}
          selectable={selectablePartId === part.id}
          onLongPressText={onLongPressText}
          isStreaming={isStreaming}
        />
      ))}
      {showTyping && <TypingDots />}
    </View>
  );
});
