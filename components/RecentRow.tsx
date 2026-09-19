import { router } from "expo-router";
import { memo, useCallback } from "react";
import { Image, Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { SignatureCard } from "@/components/SignatureCard";
import { SignatureEntrance } from "@/components/SignatureEntrance";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { RecentSession } from "@/hooks/useAllSessions";

interface RecentRowProps {
  item: RecentSession;
  index: number;
}

export const RecentRow = memo(function RecentRow({ item, index }: RecentRowProps) {
  const theme = useAppTheme();
  const { t } = useT();

  const handlePress = useCallback(() => {
    router.push(
      `/server/${item.serverId}/project/${item.projectId}/session/${item.sessionId}`,
    );
  }, [item.serverId, item.projectId, item.sessionId]);

  return (
    <SignatureEntrance index={index}>
      <SignatureCard onPress={handlePress} style={{ padding: 16, marginBottom: 12 }}>
        <View className="flex-row items-center">
          <View
            className="w-10 h-10 rounded-lg items-center justify-center mr-3"
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
              <Text className="text-2xl">📁</Text>
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
              {item.projectName} • {item.serverName}
            </Text>
            <Text
              className="text-xs mt-0.5"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {formatTimeAgo(item.updatedAt, t)}
            </Text>
          </View>
        </View>
      </SignatureCard>
    </SignatureEntrance>
  );
});
