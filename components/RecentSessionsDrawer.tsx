import { router } from "expo-router";
import { Clock, X } from "lucide-react-native";
import { memo, useCallback } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInLeft,
  SlideOutLeft,
} from "react-native-reanimated";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useAllSessions } from "@/hooks/useAllSessions";
import type { RecentSession } from "@/hooks/useAllSessions";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";

interface RecentSessionsDrawerProps {
  currentSessionId: string;
  onClose: () => void;
}

const DrawerRow = memo(function DrawerRow({
  item,
  current,
  onSelect,
}: {
  item: RecentSession;
  current: boolean;
  onSelect: (item: RecentSession) => void;
}) {
  const theme = useAppTheme();
  const { t } = useT();

  return (
    <Pressable
      onPress={() => {
        onSelect(item);
      }}
      className="px-4 py-3 mb-2 rounded-[20px] active:opacity-70"
      style={
        current
          ? { backgroundColor: theme.colors.primaryContainer }
          : {
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            }
      }
      accessibilityRole="button"
    >
      <Text
        className="text-sm font-semibold"
        style={{
          color: current
            ? theme.colors.onPrimaryContainer
            : theme.colors.onSurface,
        }}
        numberOfLines={1}
      >
        {item.sessionTitle}
      </Text>
      <Text
        className="text-xs mt-0.5"
        style={{
          color: current
            ? theme.colors.onPrimaryContainer
            : theme.colors.onSurfaceVariant,
        }}
        numberOfLines={1}
      >
        {item.projectName} • {item.serverName} • {formatTimeAgo(item.updatedAt, t)}
      </Text>
    </Pressable>
  );
});

export function RecentSessionsDrawer({
  currentSessionId,
  onClose,
}: RecentSessionsDrawerProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const servers = useAppStore((s) => s.servers);
  const { recentSessions } = useAllSessions(servers);
  const panelWidth = Dimensions.get("window").width * 0.7;

  const handleSelect = useCallback(
    (item: RecentSession) => {
      onClose();
      router.push(
        `/server/${item.serverId}/project/${item.projectId}/session/${item.sessionId}`,
      );
    },
    [onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: RecentSession }) => (
      <DrawerRow
        item={item}
        current={item.sessionId === currentSessionId}
        onSelect={handleSelect}
      />
    ),
    [currentSessionId, handleSelect],
  );

  return (
    <View className="absolute inset-0 flex-row" style={{ zIndex: 60 }}>
      <Animated.View
        entering={SlideInLeft.duration(220)}
        exiting={SlideOutLeft.duration(180)}
        className="h-full"
        style={{ width: panelWidth, backgroundColor: theme.colors.surface }}
      >
        <View
          className="flex-row items-center px-4 pt-4 pb-2"
        >
          <Clock size={18} color={theme.colors.primary} />
          <Text
            className="flex-1 text-base font-semibold ml-2"
            style={{ color: theme.colors.onSurface }}
          >
            {t("sessionDrawer.title")}
          </Text>
          <Pressable
            onPress={onClose}
            className="p-2"
            accessibilityLabel={t("common.cancel")}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>
        <FlatList
          className="flex-1"
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          data={recentSessions.slice(0, 30)}
          keyExtractor={(item) => `${item.serverId}-${item.sessionId}`}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} className="flex-1">
        <Pressable
          className="flex-1"
          style={{ backgroundColor: "rgba(28,27,31,0.45)" }}
          onPress={onClose}
          accessibilityLabel={t("common.cancel")}
          accessibilityRole="button"
        />
      </Animated.View>
    </View>
  );
}
