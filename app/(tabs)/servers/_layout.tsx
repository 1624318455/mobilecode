import { Stack } from "expo-router";

import { useT } from "@/lib/i18n";

export default function ServersLayout() {
  const { t } = useT();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t("tabs.servers"),
        }}
      />
      <Stack.Screen
        name="[serverId]"
        options={{
          title: t("settings.sessions"),
        }}
      />
    </Stack>
  );
}
