import { ReactNode } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAppTheme } from "@/components/Material3ThemeProvider";

export const SIGNATURE_RADIUS = 28;

interface SignatureCardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SignatureCard({ children, onPress, style }: SignatureCardProps) {
  const theme = useAppTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
    opacity: 1 - pressed.value * 0.15,
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withSpring(1, { damping: 20, stiffness: 400 });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, { damping: 20, stiffness: 400 });
      }}
      style={[
        {
          backgroundColor: theme.colors.surfaceContainerHigh,
          borderRadius: SIGNATURE_RADIUS,
        },
        style,
      ]}
    >
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
}

