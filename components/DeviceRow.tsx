import { router } from "expo-router";
import { MoreVertical, RefreshCw } from "lucide-react-native";
import { memo } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { DeviceRecord, Reachability } from "@/lib/protocol";
import { clearSecureForServer } from "@/lib/secure";
import { useAppStore } from "@/stores";

const STATUS_LABELS = (t: (key: string) => string): Record<DeviceRecord["reachable"], string> => ({
  ok: t("device.reachable"),
  checking: t("device.checking"),
  unreachable: t("device.unreachable"),
  revoked: t("device.revoked"),
  expired: t("device.expired"),
});

interface DeviceRowProps {
  record: DeviceRecord;
  checking: boolean;
  onCheck: () => void;
  onOpen: () => void;
}

export const DeviceRow = memo(function DeviceRow({
  record,
  checking,
  onCheck,
  onOpen,
}: DeviceRowProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const removeServer = useAppStore((s) => s.removeServer);
  const server = useAppStore((s) => s.servers.find((x) => x.id === record.id));

  const dotColor: Record<Reachability, string> = {
    ok: theme.colors.tertiary,
    checking: theme.colors.onSurfaceVariant,
    unreachable: theme.colors.onSurfaceVariant,
    revoked: theme.colors.onSurfaceVariant,
    expired: theme.colors.tertiary,
  };

  const handleMenu = () => {
    const labels = STATUS_LABELS(t);

    Alert.alert(record.customName, `${record.origin}`, [
      {
        text: t("device.menuRepair"),
        onPress: () => {
          router.push("/server/pair");
        },
      },
      {
        text: t("device.menuCheck"),
        onPress: () => {
          onCheck();
        },
      },
      {
        text: t("device.menuDelete"),
        style: "destructive",
        onPress: () => {
          Alert.alert(
            t("device.delTitle"),
            t("device.delMsg"),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("common.delete"),
                style: "destructive",
                onPress: () => {
                  if (server?.deviceTokenRef) {
                    clearSecureForServer(server.deviceTokenRef);
                  }

                  removeServer(record.id);
                },
              },
            ],
          );
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  return (
    <Pressable
      onPress={onOpen}
      className="rounded-2xl p-4 mb-3 active:opacity-80"
      style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
    >
      <View className="flex-row items-center">
        <View
          className="w-3 h-3 rounded-full mr-3"
          style={{ backgroundColor: dotColor[record.reachable] }}
        />
        <View className="flex-1 min-w-0">
          <Text
            className="text-base font-semibold"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {record.customName}
          </Text>
          <Text
            className="text-sm mt-0.5"
            style={{ color: theme.colors.onSurfaceVariant }}
            numberOfLines={1}
          >
            {record.mode === "remote" ? t("device.remote") : t("device.lan")} • {record.origin}
          </Text>
          <Text
            className="text-xs mt-0.5"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {STATUS_LABELS(t)[record.reachable]}
            {record.lastConnectedAt
              ? ` • ${t("device.lastConnected", { t: formatTimeAgo(record.lastConnectedAt, t) })}`
              : ""}
          </Text>
        </View>
        <Pressable
          onPress={onCheck}
          disabled={checking}
          className="p-2 mr-1"
          accessibilityLabel={t("device.menuCheck")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {checking ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <RefreshCw size={18} color={theme.colors.primary} />
          )}
        </Pressable>
        <Pressable
          onPress={handleMenu}
          className="p-2"
          accessibilityLabel={t("a11y.deviceMenu")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreVertical size={18} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>
      {(record.reachable === "expired" || record.reachable === "revoked") && (
        <Pressable
          onPress={() => {
            router.push("/server/pair");
          }}
          className="mt-3 rounded-lg py-2 items-center"
          style={{ backgroundColor: theme.colors.tertiaryContainer }}
        >
          <Text
            className="font-medium text-sm"
            style={{ color: theme.colors.onTertiaryContainer }}
          >
            {t("device.repairCta")}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
});
