import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { DiagLogSection } from "@/components/DiagLogSection";
import { SkeletonRows } from "@/components/SkeletonRows";
import { GatewayState, useDiagnostics } from "@/hooks/useDiagnostics";
import { useAllSessions } from "@/hooks/useAllSessions";
import { BUILD_ID } from "@/lib/buildInfo";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import { useDiagLogStore } from "@/stores/diagLog";
import { useReplyHealthStore } from "@/stores/replyHealth";
import { useSseStore } from "@/stores/sse";
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
  const { fetchInfo } = useAllSessions(servers);
  const sseByUrl = useSseStore((s) => s.byUrl);
  const watcherByUrl = useReplyHealthStore((s) => s.byUrl);
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
  const loggedFetchErrors = useRef<Record<string, string>>({});

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  // Mirror aggregation failures into the resident log (once per distinct
  // error per server; cleared when the error goes away).
  useEffect(() => {
    for (const info of fetchInfo) {
      if (info.error) {
        if (loggedFetchErrors.current[info.serverId] !== info.error) {
          loggedFetchErrors.current[info.serverId] = info.error;
          useDiagLogStore
            .getState()
            .log(info.serverName || info.serverId, "error", info.error);
        }
      } else {
        delete loggedFetchErrors.current[info.serverId];
      }
    }
  }, [fetchInfo]);

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
            style={{
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            }}
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
              style={{
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            }}
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
                  {(() => {
                    const infos = fetchInfo.filter(
                      (f) => f.serverId === server.id,
                    );

                    if (infos.length === 0) {
                      return null;
                    }

                    const shown = infos.reduce((n, f) => n + f.shown, 0);
                    const fetched = infos.reduce((n, f) => n + f.fetched, 0);
                    const dirsQueried = infos.reduce((n, f) => n + (f.dirsQueried ?? 0), 0);
                    const dirsFailed = infos.reduce((n, f) => n + (f.dirsFailed ?? 0), 0);
                    const dropped = infos.reduce(
                      (n, f) => n + f.droppedNoTime + f.droppedArchived + (f.droppedNoDirectory ?? 0),
                      0,
                    );
                    const errors = infos
                      .map((f) => f.error)
                      .filter((e): e is string => !!e);

                    const sse = sseByUrl[server.url];
                    const sseState = sse?.state ?? "off";
                    const sseStateText =
                      sseState === "live"
                        ? t("sse.live")
                        : sseState === "connecting"
                          ? t("sse.connecting")
                          : sseState === "error"
                            ? t("sse.error")
                            : t("sse.off");
                    const watcher = watcherByUrl[server.url];
                    const watcherState = watcher?.state ?? "off";
                    const watcherStateText =
                      watcherState === "live"
                        ? t("sse.live")
                        : watcherState === "connecting"
                          ? t("sse.connecting")
                          : watcherState === "error"
                            ? t("sse.error")
                            : t("sse.off");

                    return (
                      <>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          sessions {shown}/{fetched} · {dirsQueried} project dirs
                          {dirsFailed > 0 ? ` (${dirsFailed} failed)` : ""}
                          {dropped > 0 ? ` · ${dropped} dropped` : ""}
                          {errors.length > 0 ? ` • ${errors[0]}` : ""}
                        </Text>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          SSE {sseStateText}
                          {sse?.lastEventAt
                            ? ` · ${formatTimeAgo(new Date(sse.lastEventAt).toISOString(), t)}`
                            : ""}
                          {(sse?.errors ?? 0) > 0 ? ` · err ${sse?.errors}` : ""}
                        </Text>
                        <Text
                          className="text-xs mt-0.5"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {t("diagnostics.watcher")} {watcherStateText} ·{" "}
                          {watcher?.dirs ?? 0} subscribed dirs
                          {(watcher?.busy ?? 0) > 0 ? ` · busy ${watcher?.busy}` : ""}
                          {watcher?.lastEventAt
                            ? ` · ${formatTimeAgo(new Date(watcher.lastEventAt).toISOString(), t)}`
                            : ""}
                          {(watcher?.errors ?? 0) > 0 ? ` · err ${watcher?.errors}` : ""}
                          {watcher?.lastNotifyAt
                            ? ` · push ${formatTimeAgo(new Date(watcher.lastNotifyAt).toISOString(), t)}`
                            : ""}
                          {watcher?.lastNotifyError
                            ? ` · push err: ${watcher.lastNotifyError.slice(0, 60)}`
                            : ""}
                          {watcher?.lastDoneAt
                            ? ` · done ${formatTimeAgo(new Date(watcher.lastDoneAt).toISOString(), t)} (${watcher.lastDoneState ?? "?"})`
                            : ""}
                          {watcher?.lastPollAt
                            ? ` · poll ${formatTimeAgo(new Date(watcher.lastPollAt).toISOString(), t)}`
                            : ""}
                          {watcher?.lastBgAt
                            ? ` · bg ${formatTimeAgo(new Date(watcher.lastBgAt).toISOString(), t)}`
                            : ""}
                          {watcher?.lastFgAt
                            ? ` · fg ${formatTimeAgo(new Date(watcher.lastFgAt).toISOString(), t)}`
                            : ""}
                          {watcher?.lastSpeakAt
                            ? ` · read ${formatTimeAgo(new Date(watcher.lastSpeakAt).toISOString(), t)} ${(watcher.lastSpeakSid ?? "").slice(-6)} ${watcher.lastSpeakWhy ?? "?"}`
                            : ""}
                        </Text>
                      </>
                    );
                  })()}
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
          style={{
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            }}
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

        <DiagLogSection />

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
        <Text
          className="text-xs mt-1 text-center font-mono"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          build {BUILD_ID}
        </Text>
      </View>
    </ScrollView>
  );
}
