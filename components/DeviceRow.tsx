import { router } from "expo-router";
import { MoreVertical, RefreshCw } from "lucide-react-native";
import { memo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { DeviceMenuSheet } from "@/components/DeviceMenuSheet";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { useNotifyColors } from "@/lib/notify";
import { DeviceRecord, Reachability } from "@/lib/protocol";

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
  const notify = useNotifyColors();
  const [menuVisible, setMenuVisible] = useState(false);

  const dotColor: Record<Reachability, string> = {
    ok: theme.colors.tertiary,
    checking: theme.colors.onSurfaceVariant,
    unreachable: theme.colors.onSurfaceVariant,
    revoked: theme.colors.onSurfaceVariant,
    expired: notify.accent,
  };

  return (
    <Pressable
      onPress={onOpen}
      className="rounded-[28px] p-4 mb-3 active:opacity-80"
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
          onPress={() => {
            setMenuVisible(true);
          }}
          className="p-2"
          accessibilityLabel={t("a11y.deviceMenu")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreVertical size={18} color={theme.colors.onSurfaceVariant} />
        </Pressable>
        {menuVisible ? (
          <DeviceMenuSheet
            visible
            record={record}
            onCheck={onCheck}
            onClose={() => {
              setMenuVisible(false);
            }}
          />
        ) : null}
      </View>
      {(record.reachable === "expired" || record.reachable === "revoked") && (
        <Pressable
          onPress={() => {
            router.push("/server/pair");
          }}
          className="mt-3 rounded-[28px] py-2 items-center"
          style={{
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
        >
          <Text
            className="font-medium text-sm"
            style={{ color: notify.onContainer }}
          >
            {t("device.repairCta")}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
});
