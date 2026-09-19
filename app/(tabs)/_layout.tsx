import { Tabs } from "expo-router";
import { Activity, Clock, Server, Settings } from "lucide-react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";

export default function TabLayout() {
  const theme = useAppTheme();
  const { t } = useT();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.onSecondaryContainer,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarActiveBackgroundColor: theme.colors.secondaryContainer,
        tabBarStyle: {
          backgroundColor: theme.colors.elevation.level2,
          borderTopColor: theme.colors.surfaceVariant,
        },
        headerStyle: {
          backgroundColor: theme.colors.elevation.level2,
        },
        headerTintColor: theme.colors.onSurface,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.recents"),
          tabBarIcon: ({ color, size }) => <Clock size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="servers"
        options={{
          title: t("tabs.servers"),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Server size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="diagnostics"
        options={{
          title: t("tabs.diagnostics"),
          tabBarIcon: ({ color, size }) => (
            <Activity size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
