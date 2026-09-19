import { ReactNode } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";

export const SIGNATURE_RADIUS = 28;

interface SignatureCardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SignatureCard({ children, onPress, style }: SignatureCardProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.colors.onSurface, borderless: false }}
      style={({ pressed }) => [
        {
          backgroundColor: theme.colors.surfaceContainerHigh,
          borderRadius: SIGNATURE_RADIUS,
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
