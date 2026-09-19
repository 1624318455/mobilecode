import { memo } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";

interface SessionBadgesProps {
  agent?: string;
  modelName?: string;
}

export const SessionBadges = memo(function SessionBadges({
  agent,
  modelName,
}: SessionBadgesProps) {
  const theme = useAppTheme();

  if (!agent && !modelName) {
    return null;
  }

  return (
    <View className="flex-row mt-1.5 gap-1.5">
      {agent && (
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: theme.colors.secondaryContainer }}
        >
          <Text
            className="text-xs font-medium capitalize"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {agent}
          </Text>
        </View>
      )}
      {modelName && (
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: theme.colors.tertiaryContainer }}
        >
          <Text
            className="text-xs font-medium"
            style={{ color: theme.colors.onTertiaryContainer }}
            numberOfLines={1}
          >
            {modelName}
          </Text>
        </View>
      )}
    </View>
  );
});
