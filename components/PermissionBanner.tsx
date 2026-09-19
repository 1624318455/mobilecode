import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Terminal } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { PermissionRequest } from "@opencode-ai/sdk/v2";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { createClient } from "@/lib/opencode-client";
import { useT } from "@/lib/i18n";
import { Server } from "@/stores";

interface PermissionBannerProps {
  request: PermissionRequest;
  server: Server;
}

function getPermissionLabel(permission: string, t: (key: string) => string): string {
  switch (permission) {
    case "bash":
      return t("permission.bash");
    case "edit":
      return t("permission.edit");
    case "read":
      return t("permission.read");
    case "external_directory":
      return t("permission.extDir");
    case "doom_loop":
      return t("permission.doom");
    default:
      return permission;
  }
}

function getPermissionIcon(permission: string, color: string) {
  if (permission === "bash") {
    return <Terminal size={18} color={color} />;
  }

  return <Shield size={18} color={color} />;
}

export function PermissionBanner({ request, server }: PermissionBannerProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();  const [rejectMessage, setRejectMessage] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const replyMutation = useMutation({
    mutationFn: async ({ reply, message }: { reply: "once" | "always" | "reject"; message?: string }) => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.permission.reply({
        requestID: request.id,
        reply,
        message,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "permissions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "messages"],
      });
    },
  });

  const isPending = replyMutation.isPending;

  function handleAllow() {
    replyMutation.mutate({ reply: "once" });
  }

  function handleAlwaysAllow() {
    replyMutation.mutate({ reply: "always" });
  }

  function handleReject() {
    if (showRejectInput) {
      const message = rejectMessage.trim() || undefined;
      replyMutation.mutate({ reply: "reject", message });
    } else {
      setShowRejectInput(true);
    }
  }

  function handleRejectImmediately() {
    replyMutation.mutate({ reply: "reject" });
  }

  const patterns = request.patterns ?? [];
  const metadata = request.metadata ?? {};
  const command = metadata.command as string | undefined;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className="mx-4 mb-3 overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 28,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pt-3 pb-2">
        {getPermissionIcon(request.permission, theme.colors.tertiary)}
        <Text
          className="text-sm font-semibold flex-1"
          style={{ color: theme.colors.onTertiaryContainer }}
        >
          {getPermissionLabel(request.permission, t)}
        </Text>
      </View>

      {/* Details */}
      <View className="px-4 pb-3">
        {command ? (
          <View
            className="rounded-[28px] px-3 py-2 mb-2"
            style={{ backgroundColor: theme.colors.inverseSurface }}
          >
            <Text
              className="text-xs font-mono"
              style={{ color: theme.colors.inversePrimary }}
              numberOfLines={5}
            >
              $ {command}
            </Text>
          </View>
        ) : null}

        {!command && patterns.length > 0 ? (
          <View className="gap-1 mb-2">
            {patterns.map((pattern, i) => (
              <Text
                key={i}
                className="text-xs font-mono rounded-[28px] px-2 py-1"
                style={{
                  color: theme.colors.onTertiaryContainer,
                  backgroundColor: theme.colors.surfaceContainerLowest,
                }}
                numberOfLines={2}
              >
                {pattern}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Reject with message input */}
        {showRejectInput ? (
          <TextInput
            value={rejectMessage}
            onChangeText={setRejectMessage}
            placeholder={t("permission.feedbackPh")}            placeholderTextColor={theme.colors.onSurfaceVariant}
            editable={!isPending}
            autoFocus
            className="mb-2 px-3 py-2 rounded-[28px] text-sm"
            style={{
              backgroundColor: theme.colors.surfaceContainerLowest,
              color: theme.colors.onSurface,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            }}
          />
        ) : null}
      </View>

      {/* Actions */}
      <View className="flex-row justify-end gap-2 px-4 pb-3">
        {isPending ? (
          <ActivityIndicator size="small" color={theme.colors.tertiary} />
        ) : (
          <>
            <Pressable
              onPress={showRejectInput ? handleReject : handleRejectImmediately}
              disabled={isPending}
              className="px-3 py-2 rounded-[28px]"
              style={{ backgroundColor: theme.colors.errorContainer }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: theme.colors.onErrorContainer }}
              >
                {showRejectInput ? t("permission.send") : t("permission.reject")}
              </Text>
            </Pressable>
            {!showRejectInput ? (
              <Pressable
                onPress={() => setShowRejectInput(true)}
                disabled={isPending}
                className="px-3 py-2 rounded-[28px]"
                style={{ backgroundColor: theme.colors.surfaceVariant }}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t("permission.rejectFeedback")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleAlwaysAllow}
              disabled={isPending}
              className="px-3 py-2 rounded-[28px]"
              style={{ backgroundColor: theme.colors.tertiary }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: theme.colors.onTertiary }}
              >
                {t("permission.always")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAllow}
              disabled={isPending}
              className="px-3 py-2 rounded-[28px]"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: theme.colors.onPrimary }}
              >
                {t("permission.allow")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      {replyMutation.error && (
        <Text
          className="text-xs px-4 pb-3"
          style={{ color: theme.colors.onTertiaryContainer }}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {t("feedback.replyFailed")}
        </Text>
      )}
    </Animated.View>
  );
}
