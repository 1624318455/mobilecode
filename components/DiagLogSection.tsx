import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { useNotifyColors } from "@/lib/notify";
import { DiagLevel, useDiagLogStore } from "@/stores/diagLog";

const RENDER_CAP = 30;

type Filter = "all" | "issues";

function levelColor(
  level: DiagLevel,
  theme: ReturnType<typeof useAppTheme>,
  notify: ReturnType<typeof useNotifyColors>,
): string {
  if (level === "success") {
    return theme.colors.tertiary;
  }

  if (level === "warn") {
    return notify.accent;
  }

  if (level === "error") {
    return theme.colors.error;
  }

  return theme.colors.onSurfaceVariant;
}

export function DiagLogSection() {
  const theme = useAppTheme();
  const { t, locale } = useT();
  const notify = useNotifyColors();
  const entries = useDiagLogStore((s) => s.entries);
  const clear = useDiagLogStore((s) => s.clear);
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const kept =
      filter === "all"
        ? entries
        : entries.filter((e) => e.level === "warn" || e.level === "error");

    return kept.slice(0, RENDER_CAP);
  }, [entries, filter]);

  const pill = (active: boolean) => ({
    backgroundColor: active
      ? theme.colors.secondaryContainer
      : theme.colors.surfaceVariant,
  });
  const pillText = (active: boolean) => ({
    color: active
      ? theme.colors.onSecondaryContainer
      : theme.colors.onSurfaceVariant,
  });

  return (
    <View>
      <View className="flex-row items-center mt-2 mb-3">
        <Text
          className="text-lg font-semibold flex-1"
          style={{ color: theme.colors.onSurface }}
        >
          {t("diagnostics.logTitle")}
        </Text>
        {entries.length > 0 ? (
          <Pressable
            onPress={clear}
            className="px-3 py-1.5"
            accessibilityRole="button"
            accessibilityLabel={t("diagnostics.logClear")}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: theme.colors.error }}
            >
              {t("diagnostics.logClear")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row gap-2 mb-3">
        <Pressable
          onPress={() => {
            setFilter("all");
          }}
          className="rounded-full px-4 py-1.5 active:opacity-80"
          style={pill(filter === "all")}
          accessibilityRole="button"
          accessibilityLabel={t("diagnostics.logAll")}
        >
          <Text className="text-sm font-medium" style={pillText(filter === "all")}>
            {t("diagnostics.logAll")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setFilter("issues");
          }}
          className="rounded-full px-4 py-1.5 active:opacity-80"
          style={pill(filter === "issues")}
          accessibilityRole="button"
          accessibilityLabel={t("diagnostics.logIssues")}
        >
          <Text
            className="text-sm font-medium"
            style={pillText(filter === "issues")}
          >
            {t("diagnostics.logIssues")}
          </Text>
        </Pressable>
      </View>
      <View
        className="rounded-[28px] p-4 mb-4"
        style={{
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
        }}
      >
        {visible.length === 0 ? (
          <Text
            className="text-sm text-center py-4"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("diagnostics.logEmpty")}
          </Text>
        ) : (
          visible.map((entry) => (
            <View key={entry.id} className="flex-row py-2">
              <View
                className="w-2 h-2 rounded-full mr-3 mt-[7px]"
                style={{
                  backgroundColor: levelColor(entry.level, theme, notify),
                }}
              />
              <View className="flex-1 min-w-0">
                <Text
                  className="text-sm"
                  style={{ color: theme.colors.onSurface }}
                  numberOfLines={3}
                >
                  {entry.msg}
                  {entry.count > 1 ? ` ×${entry.count}` : ""}
                </Text>
                <Text
                  className="text-xs mt-0.5 font-mono"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {new Date(entry.at).toLocaleTimeString(locale, {
                    hour12: false,
                  })}{" "}
                  · {entry.server}
                </Text>
              </View>
            </View>
          ))
        )}
        {entries.length > RENDER_CAP ? (
          <Text
            className="text-xs text-center pt-2"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("diagnostics.logCapped")}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
