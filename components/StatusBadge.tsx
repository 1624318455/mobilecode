import { Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";

interface StatusBadgeProps {
  status: "idle" | "busy" | "retry" | "connecting" | "connected" | "error";
  size?: "sm" | "md";
}

type BadgeTone = "surface" | "progress" | "done" | "error";

const statusTone: Record<StatusBadgeProps["status"], BadgeTone> = {
  idle: "surface",
  busy: "progress",
  retry: "progress",
  connecting: "progress",
  connected: "done",
  error: "error",
};

const statusTextKey: Record<StatusBadgeProps["status"], string> = {
  idle: "status.idle",
  busy: "status.busy",
  retry: "status.retry",
  connecting: "status.connecting",
  connected: "status.connected",
  error: "status.error",
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const tone = statusTone[status] || "surface";
  const sizeClasses = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  const backgroundColor =
    tone === "error"
      ? theme.colors.errorContainer
      : tone === "done"
        ? theme.colors.tertiaryContainer
        : tone === "progress"
          ? theme.colors.secondaryContainer
          : theme.colors.surfaceVariant;
  const color =
    tone === "error"
      ? theme.colors.onErrorContainer
      : tone === "done"
        ? theme.colors.onTertiaryContainer
        : tone === "progress"
          ? theme.colors.onSecondaryContainer
          : theme.colors.onSurfaceVariant;

  return (
    <View
      className={`${sizeClasses} rounded-full`}
      style={{ backgroundColor }}
    >
      <Text className={`${textSize} font-medium`} style={{ color }}>
        {t(statusTextKey[status] || "status.idle")}
      </Text>
    </View>
  );
}
