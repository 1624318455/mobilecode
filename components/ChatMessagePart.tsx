import { ChevronDown, ChevronUp, File, ScrollText } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import {
  GestureResponderEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import type { PermissionRequest } from "@opencode/client";

import { MarkdownContent } from "./MarkdownContent";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { splitCarriedText } from "@/lib/historyDigest";
import type { ChatPart, ChatToolPart } from "@/lib/v2messages";
import { Server } from "@/stores";
import { ToolInvocation } from "./ToolInvocation";

export interface PartLongPress {
  text: string;
  partId: string;
  x: number;
  y: number;
}

interface ChatMessagePartProps {
  part: ChatPart;
  isUser: boolean;
  server?: Server;
  pendingPermissions?: PermissionRequest[];
  selectable?: boolean;
  onLongPressText?: (info: PartLongPress) => void;
  isStreaming?: boolean;
}

const BUBBLE_RADIUS = 28;

export const ChatMessagePart = memo(function ChatMessagePart({
  part,
  isUser,
  server,
  pendingPermissions,
  selectable = false,
  onLongPressText,
  isStreaming = false,
}: ChatMessagePartProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const [digestOpen, setDigestOpen] = useState(false);

  // Carried digest (historyDigest.buildRescueText): collapse it so the
  // user's own words stay front and center.
  const carried = useMemo(() => {
    if (!isUser || part.type !== "text" || !part.text) {
      return null;
    }

    return splitCarriedText(part.text.trim());
  }, [isUser, part]);

  function handleLongPress(e: GestureResponderEvent) {
    if (isUser || selectable) {
      return;
    }

    onLongPressText?.({
      text: part.type === "text" ? (part.text ?? "") : "",
      partId: part.id,
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
    });
  }

  if (part.type === "text") {
    if (!part.text || part.text.trim() === "") {
      return null;
    }

    if (isUser) {
      return (
        <View
          className="max-w-[80%] px-4 py-3"
          style={{
            backgroundColor: theme.colors.secondaryContainer,
            borderRadius: BUBBLE_RADIUS,
          }}
        >
          {carried ? (
            <View className="gap-2">
              <Pressable
                onPress={() => {
                  setDigestOpen((v) => !v);
                }}
                className="flex-row items-center gap-2 px-3 py-2"
                style={{
                  backgroundColor: theme.colors.surfaceContainerHigh,
                  borderRadius: 16,
                }}
                accessibilityRole="button"
              >
                <ScrollText size={14} color={theme.colors.onSurfaceVariant} />
                <Text
                  className="flex-1 text-xs"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  numberOfLines={1}
                >
                  {t("digest.title", { n: carried.digest.length })}
                </Text>
                <Text
                  className="text-xs"
                  style={{ color: theme.colors.primary }}
                >
                  {digestOpen ? t("digest.collapse") : t("digest.expand")}
                </Text>
                {digestOpen ? (
                  <ChevronUp size={14} color={theme.colors.onSurfaceVariant} />
                ) : (
                  <ChevronDown size={14} color={theme.colors.onSurfaceVariant} />
                )}
              </Pressable>
              {digestOpen ? (
                <Text
                  className="text-xs"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {carried.digest}
                </Text>
              ) : null}
              <MarkdownContent
                content={carried.question.trim() || part.text.trim()}
                isUser={isUser}
                selectable
              />
            </View>
          ) : (
            <MarkdownContent content={part.text.trim()} isUser={isUser} selectable />
          )}
        </View>
      );
    }

    // Assistant messages render as bare text (no bubble card): the content
    // itself carries the hierarchy (headings/code/quotes keep their own
    // backgrounds from MarkdownContent).
    const bubble = (
      <View className="w-full px-1 py-1">
        <MarkdownContent
          content={part.text.trim()}
          isUser={isUser}
          selectable={selectable}
        />
        {isStreaming && !isUser ? (
          <Text
            style={{
              color: theme.colors.primary,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {"\u258D"}
          </Text>
        ) : null}
      </View>
    );

    if (isUser || !onLongPressText) {
      return bubble;
    }

    return (
      <Pressable onLongPress={handleLongPress} delayLongPress={350}>
        {bubble}
      </Pressable>
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
          backgroundColor: theme.colors.surface,
          borderRadius: BUBBLE_RADIUS,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
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
        <ToolInvocation
          part={part as ChatToolPart}
          server={server}
          pendingPermissions={pendingPermissions}
        />
      </View>
    );
  }

  // Reasoning internals stay hidden; question/file records are covered
  // by their own cards or the mention chips in the text.
  return null;
});
