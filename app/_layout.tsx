import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { startAliveService, stopAliveService } from "mobilecode-alive";
import { StrictMode, useEffect } from "react";
import { Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";
import "../global.css";

import { Material3ThemeProvider } from "@/components/Material3ThemeProvider";
import { useColorScheme } from "@/components/useColorScheme";
import { useReactQuerySetup } from "@/hooks/useReactQuerySetup";
import { useReplyWatcher } from "@/hooks/useReplyWatcher";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import { useUnreadStore } from "@/stores/unread";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      gcTime: 1000 * 60 * 60 * 24 * 365,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...MaterialIcons.font,
  });

  useReactQuerySetup();

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function ReplyWatcherHost() {
  const servers = useAppStore((s) => s.servers);
  const notifyEnabled = useUnreadStore((s) => s.notifyEnabled);
  const unreadCount = useUnreadStore((s) => Object.keys(s.items).length);
  const { t } = useT();
  useReplyWatcher(servers);

  // Foreground keep-alive (Android only): a low-importance persistent
  // notification keeps the process — and the reply watcher — running when
  // the app goes to background. Tied to the system-notification switch so
  // turning it off removes the icon too. The try/catch covers stale builds
  // that predate the native module.
  // The bar doubles as an unread counter so the state is visible even when
  // MIUI suppresses the separate heads-up popup.
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    try {
      if (notifyEnabled) {
        const message =
          unreadCount > 0
            ? t("notify.unreadCount", { n: unreadCount })
            : t("notify.aliveMsg");
        startAliveService(t("notify.aliveTitle"), message);
      } else {
        stopAliveService();
      }
    } catch {
      // Native module missing — watcher still works in foreground.
    }
  }, [notifyEnabled, unreadCount, t]);

  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t } = useT();

  return (
    <StrictMode>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <Material3ThemeProvider
          sourceColor="#0052FF"
          fallbackSourceColor="#0052FF"
        >
          <QueryClientProvider client={queryClient}>
            <ReplyWatcherHost />
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <StatusBar style="auto" />
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="server/new"
                  options={{
                    presentation: "modal",
                    title: t("newServer.title"),
                  }}
                />
                <Stack.Screen
                  name="server/pair"
                  options={{
                    presentation: "modal",
                    title: t("pair.title"),
                  }}
                />
                <Stack.Screen
                  name="server/[serverId]/project/[projectId]/session/[sessionId]/index"
                  options={{
                    title: t("chat.title"),
                  }}
                />
                <Stack.Screen
                  name="server/[serverId]/project/[projectId]/session/[sessionId]/settings/index"
                  options={{
                    title: t("sessionSettings.title"),
                  }}
                />
                <Stack.Screen
                  name="picker/agent"
                  options={{
                    presentation: "formSheet",
                    sheetAllowedDetents: [0.35],
                    sheetGrabberVisible: true,
                    title: t("pickers.selectAgent"),
                  }}
                />
                <Stack.Screen
                  name="picker/model"
                  options={{
                    presentation: "formSheet",
                    sheetAllowedDetents: [0.5, 0.75],
                    sheetGrabberVisible: true,
                    title: t("pickers.selectModel"),
                  }}
                />
            </Stack>
          </ThemeProvider>
          </QueryClientProvider>
        </Material3ThemeProvider>
      </KeyboardProvider>
      </GestureHandlerRootView>
    </StrictMode>
  );
}
