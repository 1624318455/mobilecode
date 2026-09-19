import { File } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";
import type { Part, ToolPart } from "@opencode-ai/sdk/v2";

import { MarkdownContent } from "./MarkdownContent";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { ToolInvocation } from "./ToolInvocation";

interface ChatMessagePartProps {
  part: Part;
  isUser: boolean;
}

const BUBBLE_RADIUS = 20;

export const ChatMessagePart = memo(function ChatMessagePart({
  part,
  isUser,
}: ChatMessagePartProps) {
  const theme = useAppTheme();

  if (part.type === "text") {
    if (!part.text || part.text.trim() === "") {
      return null;
    }

    if (isUser) {
      return (
        <View
          className="max-w-[80%] px-4 py-3"
          style={{
            backgroundColor: theme.colors.primaryContainer,
            borderRadius: BUBBLE_RADIUS,
          }}
        >
          <MarkdownContent content={part.text.trim()} isUser={isUser} />
        </View>
      );
    }

    return (
      <View
        className="max-w-[80%] px-4 py-3"
        style={{
          backgroundColor: theme.colors.surfaceContainerHigh,
          borderRadius: BUBBLE_RADIUS,
        }}
      >
        <MarkdownContent content={part.text.trim()} isUser={isUser} />
      </View>
    );
  }

  if (part.type === "file") {
    if (isUser) {
      return null;
    }

    return (
      <View
        className="w-full max-w-[80%] px-4 py-3"
        style={{
          backgroundColor: theme.colors.surfaceContainerHigh,
          borderRadius: BUBBLE_RADIUS,
        }}
      >
        <View className="flex-row items-center gap-2">
          <File size={16} color={theme.colors.primary} />
          <Text
            className="text-sm"
            style={{ color: theme.colors.primary }}
          >
            {part.filename || part.url}
          </Text>
        </View>
      </View>
    );
  }

  if (part.type === "tool") {
    return (
      <View className="w-full">
        <ToolInvocation part={part as ToolPart} />
      </View>
    );
  }

  return null;
});
