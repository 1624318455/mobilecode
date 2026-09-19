import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { SkeletonRows } from "@/components/SkeletonRows";
import { GatewayState, useDiagnostics } from "@/hooks/useDiagnostics";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import { useWsRules } from "@/stores/diagnostics";

export default function DiagnosticsScreen() {
  const theme = useAppTheme();
  const { t } = useT();
  const dotColors: Record<GatewayState, string> = {
    ok: theme.colors.tertiary,
    down: theme.colors.error,
    expired: theme.colors.tertiary,
    unknown: theme.colors.onSurfaceVariant,
  };
  const servers = useAppStore((s) => s.servers);
  const allowedPaths = useWsRules((s) => s.allowedPaths);
  const allowPath = useWsRules((s) => s.allowPath);
  const removePath = useWsRules((s) => s.removePath);
  const {
    checks,
    checking,
    checkServer,
    checkAll,
    blockedWs,
    buildReport,
  } = useDiagnostics(servers);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  const handleCopyReport = async () => {
    const report = buildReport();
    await Clipboard.setStringAsync(JSON.stringify(report, null, 2));
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const blockedCount = Object.values(blockedWs).flat().length;

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
    >
      <View className="p-4">
        <Text
          className="text-lg font-semibold mb-3"
          style={{ color: theme.colors.onSurface }}
        >
          {t("diagnostics.gateway")}
        </Text>
        {servers.length === 0 && (
          <View
            className="rounded-[28px] p-4 mb-4"
            style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
          >
            <Text
              className="text-center"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("diagnostics.noServers")}
            </Text>
            <Pressable
              onPress={() => router.push("/server/pair")}
              className="mt-3 rounded-[28px] py-3 items-center"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Text
                className="font-semibold"
                style={{ color: theme.colors.onPrimary }}
              >
                {t("diagnostics.pairComputer")}
              </Text>
            </Pressable>
          </View>
        )}
        {servers.length > 0 && Object.keys(checks).length === 0 && (
          <SkeletonRows count={servers.length} />
        )}
        {servers.map((server) => {
          const check = checks[server.id];
          const state = check?.state || "unknown";
          const busy = !!checking[server.id];

          return (
            <View
              key={server.id}
              className="rounded-[28px] p-4 mb-3"
              style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
            >
              <View className="flex-row items-center">
                <View
                  className="w-3 h-3 rounded-full mr-3"
                  style={{ backgroundColor: dotColors[state] }}
                />
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-base font-semibold"
                    style={{ color: theme.colors.onSurface }}
                    numberOfLines={1}
                  >
                    {server.name}
                  </Text>
                  <Text
                    className="text-sm mt-0.5"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {check
                      ? `${check.detail}${check.latencyMs !== null ? ` • ${check.latencyMs}ms` : ""}`
                      : t("diagnostics.notChecked")}
                  </Text>
                </View>
                <Pressable
                  onPress={() => checkServer(server)}
                  disabled={busy || check?.state === "ok"}
                  className="p-2"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : check?.state === "ok" ? (
                    <Text
                      className="font-medium"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {t("diagnostics.connected")}
                    </Text>
                  ) : (
                    <Text
                      className="font-medium"
                      style={{ color: theme.colors.primary }}
                    >
                      {t("diagnostics.retry")}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text
          className="text-lg font-semibold mt-2 mb-3"
          style={{ color: theme.colors.onSurface }}
        >
          {t("diagnostics.wsTitle")}
        </Text>
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          {blockedCount === 0 && allowedPaths.length === 0 && (
            <Text
              className="text-sm"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("diagnostics.wsEmpty")}
            </Text>
          )}
          {Object.entries(blockedWs).map(([serverId, rules]) =>
            rules.map((rule) => (
              <View
                key={`${serverId}${rule.path}`}
                className="flex-row items-center py-2"
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.outlineVariant,
                }}
              >
                <View className="flex-1 min-w-0 mr-2">
                  <Text
                    className="text-sm font-mono"
                    style={{ color: theme.colors.onSurface }}
                    numberOfLines={1}
                  >
                    {rule.path}
                  </Text>
                  <Text
                    className="text-xs"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("diagnostics.blocked", { n: rule.hits })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => allowPath(rule.path)}
                  className="rounded-[28px] px-3 py-1.5"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: theme.colors.onPrimary }}
                  >
                    {t("diagnostics.allow")}
                  </Text>
                </Pressable>
              </View>
            )),
          )}
          {allowedPaths.map((path) => (
            <View
              key={path}
              className="flex-row items-center py-2"
              style={{
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.outlineVariant,
              }}
            >
              <View className="flex-1 min-w-0 mr-2">
                <Text
                  className="text-sm font-mono"
                  style={{ color: theme.colors.onSurface }}
                  numberOfLines={1}
                >
                  {path}
                </Text>
                <Text
                  className="text-xs"
                  style={{ color: theme.colors.tertiary }}
                >
                  {t("diagnostics.allowed")}
                </Text>
              </View>
              <Pressable
                onPress={() => removePath(path)}
                className="rounded-[28px] px-3 py-1.5"
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: theme.colors.error }}
                >
                  {t("diagnostics.remove")}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleCopyReport}
          className="rounded-[28px] py-3 items-center"
          style={{ backgroundColor: theme.colors.secondaryContainer }}
        >
          <Text
            className="font-medium"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {copied ? t("diagnostics.copied") : t("diagnostics.copyReport")}
          </Text>
        </Pressable>
        <Text
          className="text-xs mt-2 text-center"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t("diagnostics.reportNote")}
        </Text>
      </View>
    </ScrollView>
  );
}
