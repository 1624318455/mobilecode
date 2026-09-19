import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { StrictMode, useEffect } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";
import "../global.css";

import { Material3ThemeProvider } from "@/components/Material3ThemeProvider";
import { useColorScheme } from "@/components/useColorScheme";
import { useReactQuerySetup } from "@/hooks/useReactQuerySetup";
import { useT } from "@/lib/i18n";

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

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t } = useT();

  return (
    <StrictMode>
      <KeyboardProvider>
        <Material3ThemeProvider
          sourceColor="#0052FF"
          fallbackSourceColor="#0052FF"
        >
          <QueryClientProvider client={queryClient}>
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
    </StrictMode>
  );
}
