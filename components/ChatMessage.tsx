import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PermissionRequest } from "@opencode/client";

import { ChatMessagePart, PartLongPress } from "./ChatMessagePart";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
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
  onRetry?: () => void;
}

function formatClock(created: number): string {
  const d = new Date(created);

  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  server,
  pendingPermissions,
  selectablePartId,
  onLongPressText,
  isStreaming = false,
  sessionActive = true,
  onRetry,
}: ChatMessageProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const isUser = message.info.role === "user";
  const clock = formatClock(message.info.time.created);
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
  ) {    return (
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
            {onRetry && (
              <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={t("common.retry")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="mt-2 px-3 py-1.5"
                style={{
                  backgroundColor: theme.colors.error,
                  borderRadius: 999,
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: theme.colors.onError }}
                >
                  {t("common.retry")}
                </Text>
              </Pressable>
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
      <Text
        className="text-xs mt-1 px-1"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {clock}
      </Text>
    </View>
  );
});
