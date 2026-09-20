import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { ExternalLink, Info, Trash2 } from "lucide-react-native";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useAllSessions } from "@/hooks/useAllSessions";
import { LocalePref, useAppStore } from "@/stores";
import { resolveLocaleDebug, useT } from "@/lib/i18n";

const LANGUAGE_OPTIONS: { value: LocalePref; label: string; labelKey?: string }[] = [
  { value: "system", label: "", labelKey: "settings.langSystem" },
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
];

export default function SettingsScreen() {
  const theme = useAppTheme();
  const { t } = useT();
  const servers = useAppStore((s) => s.servers);
  const clearAllData = useAppStore((s) => s.clearAllData);
  const startupBehavior = useAppStore((s) => s.startupBehavior);
  const setStartupBehavior = useAppStore((s) => s.setStartupBehavior);
  const localePref = useAppStore((s) => s.localePref);
  const setLocalePref = useAppStore((s) => s.setLocalePref);
  const localeDebug = resolveLocaleDebug(localePref);
  const { recentSessions } = useAllSessions(servers);
  // projectID is unreliable (server often stamps everything "global"),
  // so count distinct directories instead.
  const projectCount = new Set(
    recentSessions.map((s) => s.directory || s.projectId),
  ).size;

  const version = Application.nativeApplicationVersion || "Unknown";
  const buildNumber = Application.nativeBuildVersion || "Unknown";
  const updateId = Updates.updateId || "embedded";

  const handleClearData = () => {
    Alert.alert(
      t("settings.alertClearTitle"),
      t("settings.alertClearMsg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.alertClearConfirm"),
          style: "destructive",
          onPress: () => {
            clearAllData();
            Alert.alert(t("settings.clearedTitle"), t("settings.clearedMsg"));
          },
        },
      ],
    );
  };

  const radioStyle = (selected: boolean) => ({
    borderColor: selected ? theme.colors.primary : theme.colors.outline,
  });

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
    >
      <View className="p-4">
        {/* App Info */}
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <View className="flex-row items-center mb-3">
            <Info size={20} color={theme.colors.primary} />
            <Text
              className="text-lg font-semibold ml-2"
              style={{ color: theme.colors.onSurface }}
            >
              {t("settings.about")}
            </Text>
          </View>
          <Text
            className="mb-2"
            style={{ color: theme.colors.onSurface }}
          >
            MobileCode
          </Text>
          <Text
            className="text-sm"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("settings.version", { v: version, b: buildNumber })}
          </Text>
          <Text
            className="text-sm mt-1"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("settings.update", { u: updateId })}
          </Text>
          <Text
            className="text-sm mt-1"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Locale: {localeDebug.locale} ({localeDebug.raw})
          </Text>
        </View>

        {/* Stats */}
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <Text
            className="text-lg font-semibold mb-3"
            style={{ color: theme.colors.onSurface }}
          >
            {t("settings.stats")}
          </Text>
          <View
            className="flex-row justify-between py-2"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.outlineVariant,
            }}
          >
            <Text
              style={{ color: theme.colors.onSurfaceVariant, flexShrink: 1 }}
              numberOfLines={1}
            >
              {t("settings.servers")}
            </Text>
            <Text
              className="font-medium"
              style={{ color: theme.colors.onSurface, flexShrink: 0 }}
            >
              {servers.length}
            </Text>
          </View>
          <View
            className="flex-row justify-between py-2"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.outlineVariant,
            }}
          >
            <Text
              style={{ color: theme.colors.onSurfaceVariant, flexShrink: 1 }}
              numberOfLines={1}
            >
              {t("settings.projects")}
            </Text>
            <Text
              className="font-medium"
              style={{ color: theme.colors.onSurface, flexShrink: 0 }}
            >
              {projectCount}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text
              style={{ color: theme.colors.onSurfaceVariant, flexShrink: 1 }}
              numberOfLines={1}
            >
              {t("settings.sessions")}
            </Text>
            <Text
              className="font-medium"
              style={{ color: theme.colors.onSurface, flexShrink: 0 }}
            >
              {t("settings.sessionsCount", { n: recentSessions.length })}
            </Text>
          </View>
        </View>

        {/* Startup */}
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <Text
            className="text-lg font-semibold mb-3"
            style={{ color: theme.colors.onSurface }}
          >
            {t("settings.startup")}
          </Text>
          <Pressable
            onPress={() => setStartupBehavior("last")}
            className="flex-row items-center justify-between py-3"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.outlineVariant,
            }}
          >
            <View className="flex-1 mr-3">
              <Text style={{ color: theme.colors.onSurface }}>
                {t("settings.openLast")}
              </Text>
              <Text
                className="text-sm mt-0.5"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("settings.openLastDesc")}
              </Text>
            </View>
            <View
              className="w-5 h-5 rounded-full border-2 items-center justify-center"
              style={radioStyle(startupBehavior === "last")}
            >
              {startupBehavior === "last" && (
                <View
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: theme.colors.primary }}
                />
              )}
            </View>
          </Pressable>
          <Pressable
            onPress={() => setStartupBehavior("list")}
            className="flex-row items-center justify-between py-3"
          >
            <View className="flex-1 mr-3">
              <Text style={{ color: theme.colors.onSurface }}>
                {t("settings.showList")}
              </Text>
              <Text
                className="text-sm mt-0.5"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("settings.showListDesc")}
              </Text>
            </View>
            <View
              className="w-5 h-5 rounded-full border-2 items-center justify-center"
              style={radioStyle(startupBehavior === "list")}
            >
              {startupBehavior === "list" && (
                <View
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: theme.colors.primary }}
                />
              )}
            </View>
          </Pressable>
        </View>

        {/* Language */}
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <Text
            className="text-lg font-semibold mb-3"
            style={{ color: theme.colors.onSurface }}
          >
            {t("settings.language")}
          </Text>
          {LANGUAGE_OPTIONS.map((option, index) => {
            const selected = localePref === option.value;
            const last = index === LANGUAGE_OPTIONS.length - 1;

            return (
              <Pressable
                key={option.value}
                onPress={() => setLocalePref(option.value)}
                className="flex-row items-center justify-between py-3"
                style={
                  last
                    ? undefined
                    : {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.outlineVariant,
                      }
                }
              >
                <Text style={{ color: theme.colors.onSurface }}>
                  {option.labelKey ? t(option.labelKey) : option.label}
                </Text>
                <View
                  className="w-5 h-5 rounded-full border-2 items-center justify-center"
                  style={radioStyle(selected)}
                >
                  {selected && (
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Links */}
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <Text
            className="text-lg font-semibold mb-3"
            style={{ color: theme.colors.onSurface }}
          >
            {t("settings.resources")}
          </Text>
          <Pressable
            onPress={() =>
              Linking.openURL("https://opencode.ai/docs")
            }
            className="flex-row items-center justify-between py-3"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.outlineVariant,
            }}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {t("settings.docs")}
            </Text>
            <ExternalLink size={18} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        </View>

        {/* Danger Zone */}
        <View
          className="rounded-[28px] p-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <Text
            className="text-lg font-semibold mb-3"
            style={{ color: theme.colors.error }}
          >
            {t("settings.danger")}
          </Text>
          <Pressable
            onPress={handleClearData}
            className="flex-row items-center py-3"
          >
            <Trash2 size={20} color={theme.colors.error} />
            <Text className="ml-3" style={{ color: theme.colors.error }}>
              {t("settings.clearData")}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
