import { Link, Stack } from "expo-router";
import { View, Text } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";

export default function NotFoundScreen() {
  const theme = useAppTheme();
  const { t } = useT();

  return (
    <>
      <Stack.Screen options={{ title: t("notFound.title") }} />
      <View
        className="flex-1 items-center justify-center p-5"
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Text
          className="text-xl font-bold"
          style={{ color: theme.colors.onSurface }}
        >
          {t("notFound.msg")}
        </Text>
        <Link href="/" className="mt-4 py-4">
          <Text style={{ color: theme.colors.primary }}>
            {t("notFound.home")}
          </Text>
        </Link>
      </View>
    </>
  );
}
