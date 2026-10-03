import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import type { PermissionRequest } from "@opencode/client";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { createV2Client } from "@/lib/v2client";
import { isAskStale } from "@/lib/staleAsk";
import { Server } from "@/stores";

interface AskCardProps {
  server: Server;
}

function CardShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();

  return (
    <View
      className="mt-2 w-full px-4 py-3 gap-2"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderRadius: 28,
        borderWidth: 1,
      }}
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <View className="flex-1">
          <Text
            className="text-sm font-semibold"
            style={{ color: theme.colors.onSurface }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="text-xs"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export function PermissionInlineCard({
  request,
  server,
}: AskCardProps & { request: PermissionRequest }) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: async ({ reply }: { reply: "once" | "always" | "reject" }) => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.permission.reply({
        sessionID: request.sessionID,
        requestID: request.id,
        decision: reply,
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

  if (
    isAskStale(
      queryClient,
      server.url,
      request.sessionID,
      request.source?.type === "tool" ? request.source.messageID : undefined,
    )
  ) {
    return null;
  }

  return (
    <CardShell
      icon={<Shield size={18} color={theme.colors.primary} />}
      title={request.action}
      subtitle={request.resources.join(", ") || undefined}
    >
      <View className="flex-row gap-2">
        <Pressable
          disabled={isPending}
          onPress={() => {
            replyMutation.mutate({ reply: "once" });
          }}
          className="flex-1 items-center px-3 py-2"
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 999,
            opacity: isPending ? 0.5 : 1,
          }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: theme.colors.onPrimary }}
          >
            {t("permission.allow")}
          </Text>
        </Pressable>
        <Pressable
          disabled={isPending}
          onPress={() => {
            replyMutation.mutate({ reply: "always" });
          }}
          className="flex-1 items-center px-3 py-2"
          style={{
            borderColor: theme.colors.outline,
            borderRadius: 999,
            borderWidth: 1,
          }}
        >
          <Text
            className="text-xs"
            style={{ color: theme.colors.onSurface }}
          >
            {t("permission.always")}
          </Text>
        </Pressable>
        <Pressable
          disabled={isPending}
          onPress={() => {
            replyMutation.mutate({ reply: "reject" });
          }}
          className="items-center px-3 py-2"
          style={{
            borderColor: theme.colors.error,
            borderRadius: 999,
            borderWidth: 1,
          }}
        >
          <Text
            className="text-xs"
            style={{ color: theme.colors.error }}
          >
            {t("permission.reject")}
          </Text>
        </Pressable>
      </View>
    </CardShell>
  );
}
