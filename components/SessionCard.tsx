import { Pressable, Text, View } from "react-native";
import { MessageSquare } from "lucide-react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { unreadKey, useUnreadStore } from "@/stores/unread";

interface SessionCardProps {
  serverId: string;
  sessionId: string;
  title: string;
  updatedAt: string;
  onPress: () => void;
}

export function SessionCard({ serverId, sessionId, title, updatedAt, onPress }: SessionCardProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const showDot = useUnreadStore(
    (s) => s.dotEnabled && s.items[unreadKey(serverId, sessionId)] !== undefined,
  );

  return (
    <Pressable
      onPress={onPress}
      className="rounded-[28px] p-4 mb-3 active:opacity-80"
      style={{
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
      }}
    >
      <View className="flex-row items-center">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: theme.colors.tertiaryContainer }}
        >
          <MessageSquare size={20} color={theme.colors.tertiary} />
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-semibold"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className="text-sm mt-0.5"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {formatTimeAgo(updatedAt, t)}
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
    </Pressable>
  );
}
