import { memo } from "react";
import { Text, View } from "react-native";
import type { Message, Part } from "@opencode-ai/sdk/v2";

import { ChatMessagePart } from "./ChatMessagePart";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { TypingDots } from "./TypingDots";

interface ChatMessageProps {
  message: {
    info: Message;
    parts: Part[];
  };
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const theme = useAppTheme();
  const isUser = message.info.role === "user";
  const isAssistantTyping =
    message.info.role === "assistant" && !message.info.finish;

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
            {typeof message.info.error.data.message === "string" && (
              <Text
                className="text-sm"
                style={{ color: theme.colors.onErrorContainer }}
              >
                {message.info.error.data.message}
              </Text>
            )}
          </View>
        </View>
        <Text
          className="text-xs mt-1 px-2"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {new Date(message.info.time.created).toLocaleTimeString()}
        </Text>
      </View>
    );
  }

  return (
    <View className={`mb-4 ${isUser ? "items-end" : "items-start"}`}>
      {message.parts.map((part, index) => (
        <ChatMessagePart key={index} part={part} isUser={isUser} />
      ))}
      {message.parts.length > 0 && (
        <Text
          className="text-xs mt-1 px-2"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {new Date(message.info.time.created).toLocaleTimeString()}
        </Text>
      )}
      {isAssistantTyping && <TypingDots />}
    </View>
  );
});
