import { Pressable, Text, View } from "react-native";
import { MessageSquare } from "lucide-react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";

interface SessionCardProps {
  title: string;
  updatedAt: string;
  onPress: () => void;
}

export function SessionCard({ title, updatedAt, onPress }: SessionCardProps) {
  const theme = useAppTheme();
  const { t } = useT();

  return (
    <Pressable
      onPress={onPress}
      className="rounded-[28px] p-4 mb-3 active:opacity-80"
      style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
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
      </View>
    </Pressable>
  );
}
