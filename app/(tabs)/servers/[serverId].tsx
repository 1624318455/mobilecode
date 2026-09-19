import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { ServerContent } from "@/components/ServerContent";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";

export default function SessionListScreen() {
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const theme = useAppTheme();
  const { t } = useT();
  const servers = useAppStore((s) => s.servers);
  const setLastServerId = useAppStore((s) => s.setLastServerId);
  const server = servers.find((s) => s.id === serverId);

  useEffect(() => {
    if (server) {
      setLastServerId(server.id);
    }
  }, [server, setLastServerId]);

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

  return <ServerContent server={server} />;
}
