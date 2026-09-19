import { memo } from "react";
import { Text, View } from "react-native";
import { Button } from "react-native-paper";
import { LucideIcon, MessagesSquare, MonitorSmartphone, SearchX, Smartphone } from "lucide-react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";

export type EmptyKind = "sessions" | "devices" | "chat" | "models";

const KIND_ICON: Record<EmptyKind, LucideIcon> = {
  sessions: MessagesSquare,
  devices: MonitorSmartphone,
  chat: Smartphone,
  models: SearchX,
};

interface EmptyStateProps {
  kind: EmptyKind;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = memo(function EmptyState({
  kind,
  title,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const theme = useAppTheme();
  const Icon = KIND_ICON[kind];

  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Icon size={56} color={theme.colors.onSurfaceVariant} strokeWidth={1.5} />
      <Text
        className="text-xl text-center mt-4"
        style={{
          color: theme.colors.onSurface,
          fontWeight: "400",
          letterSpacing: -0.4,
        }}
      >
        {title}
      </Text>
      <Text
        className="text-sm text-center mt-2"
        style={{ color: theme.colors.onSurfaceVariant }}
      >
        {body}
      </Text>
      {actionLabel && onAction && (
        <Button mode="contained-tonal" onPress={onAction} style={{ marginTop: 16 }}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
});
