import { router } from "expo-router";
import { Folder } from "lucide-react-native";
import { memo, useCallback } from "react";
import { Image, Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { SignatureCard } from "@/components/SignatureCard";
import { SignatureEntrance } from "@/components/SignatureEntrance";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { RecentSession } from "@/hooks/useAllSessions";
import { unreadKey, useUnreadStore } from "@/stores/unread";

interface RecentRowProps {
  item: RecentSession;
  index: number;
  animate?: boolean;
  showServer?: boolean;
}

export const RecentRow = memo(function RecentRow({ item, index, animate = true, showServer = true }: RecentRowProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const showDot = useUnreadStore(
    (s) => s.dotEnabled && s.items[unreadKey(item.serverId, item.sessionId)] !== undefined,
  );

  const handlePress = useCallback(() => {
    router.push(
      `/server/${item.serverId}/project/${item.projectId}/session/${item.sessionId}`,
    );
  }, [item.serverId, item.projectId, item.sessionId]);

  return (
    <SignatureEntrance index={index} animate={animate} speed={1.5}>
      <SignatureCard onPress={handlePress} style={{ padding: 16, marginBottom: 12 }}>
        <View className="flex-row items-center">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{
              backgroundColor:
                item.projectIcon?.color || theme.colors.secondaryContainer,
            }}
          >
            {item.projectIcon?.url ? (
              <Image
                source={{ uri: item.projectIcon.url }}
                style={{ width: 32, height: 32 }}
              />
            ) : (
              <Folder size={20} color={theme.colors.onSecondaryContainer} />
            )}
          </View>
          <View className="flex-1">
            <Text
              className="text-base font-semibold"
              style={{ color: theme.colors.onSurface }}
              numberOfLines={1}
            >
              {item.sessionTitle}
            </Text>
            <Text
              className="text-sm mt-0.5"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {showServer ? `${item.projectName} • ${item.serverName}` : item.projectName}
            </Text>
            <Text
              className="text-xs mt-0.5"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {formatTimeAgo(item.updatedAt, t)}
            </Text>
          </View>
          {showDot ? (
            <View
              className="w-2 h-2 rounded-full ml-2"
              style={{ backgroundColor: theme.colors.error }}
              accessibilityLabel={t("notify.unread")}
            />
          ) : null}
        </View>
      </SignatureCard>
    </SignatureEntrance>
  );
});
