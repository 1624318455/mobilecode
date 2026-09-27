import { Check, Copy, Share2, Square, TextSelect, Volume2 } from "lucide-react-native";
import { ActivityIndicator, Dimensions, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";

export interface MenuAnchor {
  x: number;
  y: number;
}

interface MessageActionMenuProps {
  anchor: MenuAnchor;
  speaking: boolean;
  loadingSpeech: boolean;
  sharing: boolean;
  copied: boolean;
  onCopy: () => void;
  onSelectText: () => void;
  onSpeakToggle: () => void;
  onShare: () => void;
  onDismiss: () => void;
}

const MENU_WIDTH = 224;
const MENU_MARGIN = 8;

function MenuRow({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!!busy}
      className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
      accessibilityRole="menuitem"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        icon
      )}
      <Text className="text-sm" style={{ color: theme.colors.onSurface }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MessageActionMenu({
  anchor,
  speaking,
  loadingSpeech,
  sharing,
  copied,
  onCopy,
  onSelectText,
  onSpeakToggle,
  onShare,
  onDismiss,
}: MessageActionMenuProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const { width: screenW, height: screenH } = Dimensions.get("window");

  const left = Math.max(
    MENU_MARGIN,
    Math.min(anchor.x, screenW - MENU_WIDTH - MENU_MARGIN),
  );
  // Estimated menu height (~4 rows); show below the finger when space
  // allows, otherwise above it.
  const estimatedHeight = 240;
  const top =
    anchor.y + estimatedHeight + MENU_MARGIN <= screenH
      ? anchor.y + MENU_MARGIN
      : Math.max(MENU_MARGIN, anchor.y - estimatedHeight - MENU_MARGIN);

  const iconColor = theme.colors.onSurfaceVariant;

  return (
    <View className="absolute inset-0" style={{ zIndex: 50 }}>
      <Pressable
        className="absolute inset-0"
        onPress={onDismiss}
        accessibilityLabel={t("common.cancel")}
        accessibilityRole="button"
      />
      <Animated.View
        entering={FadeIn.duration(120)}
        className="absolute rounded-[20px] overflow-hidden"
        style={{
          left,
          top,
          width: MENU_WIDTH,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
          elevation: 6,
        }}
        accessibilityRole="menu"
      >
        <MenuRow
          icon={
            copied ? (
              <Check size={18} color={theme.colors.primary} />
            ) : (
              <Copy size={18} color={iconColor} />
            )
          }
          label={t("menu.copy")}
          onPress={onCopy}
        />
        <MenuRow
          icon={<TextSelect size={18} color={iconColor} />}
          label={t("menu.selectText")}
          onPress={onSelectText}
        />
        <MenuRow
          icon={
            speaking ? (
              <Square size={18} color={iconColor} />
            ) : (
              <Volume2 size={18} color={iconColor} />
            )
          }
          label={speaking ? t("menu.stop") : t("menu.speak")}
          onPress={onSpeakToggle}
          busy={loadingSpeech}
        />
        <MenuRow
          icon={<Share2 size={18} color={iconColor} />}
          label={t("menu.share")}
          onPress={onShare}
          busy={sharing}
        />
      </Animated.View>
    </View>
  );
}
