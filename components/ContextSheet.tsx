import { useMemo } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import type { ContextUsage } from "@/hooks/useModels";
import { useT } from "@/lib/i18n";

interface ContextSheetProps {
  visible: boolean;
  onClose: () => void;
  usage?: ContextUsage | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }

  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }

  return String(n);
}

function UsageRow({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm" style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text
        className="text-sm font-semibold"
        style={{ color: theme.colors.onSurface }}
      >
        {value}
      </Text>
    </View>
  );
}

export function ContextSheet({ visible, onClose, usage }: ContextSheetProps) {
  const theme = useAppTheme();
  const { t } = useT();

  const percentText = useMemo(() => {
    if (!usage || usage.percent == null) {
      return t("context.unknown");
    }

    return `${(usage.percent * 100).toFixed(1)}%`;
  }, [t, usage]);

  const barWidth = useMemo((): `${number}%` => {
    if (!usage || usage.percent == null) {
      return "0%";
    }

    return `${Math.min(100, Math.max(0, usage.percent * 100))}%`;
  }, [usage]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={onClose}
          accessibilityLabel={t("common.cancel")}
          accessibilityRole="button"
        />
        <View
          className="rounded-t-[28px] p-4 pb-8"
          style={{
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
        >
          <View
            className="self-center rounded-full mb-3"
            style={{
              width: 40,
              height: 4,
              backgroundColor: theme.colors.outlineVariant,
            }}
          />
          <Text
            className="text-base font-semibold"
            style={{ color: theme.colors.onSurface }}
          >
            {t("context.title")}
          </Text>
          {usage?.modelName ? (
            <Text
              className="text-xs mt-0.5 mb-3"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {usage.modelName}
            </Text>
          ) : null}
          <View className="flex-row items-end justify-between mt-1 mb-2">
            <Text
              className="text-3xl font-bold"
              style={{ color: theme.colors.primary }}
            >
              {percentText}
            </Text>
            <Text
              className="text-xs"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("context.used")}
            </Text>
          </View>
          <View
            className="rounded-full overflow-hidden mb-3"
            style={{
              height: 8,
              backgroundColor: theme.colors.surfaceContainerHighest,
            }}
          >
            <View
              style={{
                width: barWidth,
                height: 8,
                backgroundColor: theme.colors.primary,
              }}
            />
          </View>
          {usage ? (
            <>
              <UsageRow
                label={t("context.tokensUsed")}
                value={formatTokens(usage.used)}
              />
              <UsageRow
                label={t("context.limit")}
                value={
                  usage.limit != null
                    ? formatTokens(usage.limit)
                    : t("context.unknown")
                }
              />
              <UsageRow
                label={t("context.input")}
                value={formatTokens(usage.input)}
              />
              <UsageRow
                label={t("context.output")}
                value={formatTokens(usage.output)}
              />
              <UsageRow
                label={t("context.cached")}
                value={formatTokens(usage.cached)}
              />
            </>
          ) : (
            <Text
              className="text-sm"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("context.unknown")}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
