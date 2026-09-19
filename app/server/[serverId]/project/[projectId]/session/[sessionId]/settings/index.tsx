import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { SessionSettingsContent } from "@/components/SessionSettingsContent";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";

export default function SessionSettingsScreen() {
  const { serverId, projectId, sessionId } = useLocalSearchParams<{
    serverId: string;
    projectId: string;
    sessionId: string;
  }>();
  const theme = useAppTheme();
  const { t } = useT();
  const servers = useAppStore((s) => s.servers);
  const server = servers.find((s) => s.id === serverId);

  if (!server) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          {t("misc.serverNotFound")}
        </Text>
      </View>
    );
  }

  return (
    <SessionSettingsContent
      server={server}
      projectId={projectId}
      sessionId={sessionId}
    />
  );
}
