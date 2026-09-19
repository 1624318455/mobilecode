import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { SessionChatContent } from "@/components/SessionChatContent";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";

export default function SessionChatScreen() {
  const { serverId, sessionId, projectId } = useLocalSearchParams<{
    serverId: string;
    sessionId: string;
    projectId: string;
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
    <SessionChatContent
      server={server}
      sessionId={sessionId}
      projectId={projectId}
    />
  );
}
