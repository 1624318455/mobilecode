import { ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";

export const STAGGER_MS = 60;
export const STAGGER_MAX = 8;

export function staggerDelay(index: number, speed = 1): number {
  const s = speed > 0 ? speed : 1;

  return Math.round(Math.min(Math.max(index, 0), STAGGER_MAX) * STAGGER_MS / s);
}

interface SignatureEntranceProps {
  index: number;
  children: ReactNode;
  animate?: boolean;
  speed?: number;
}

export function SignatureEntrance({
  index,
  children,
  animate = true,
  speed = 1,
}: SignatureEntranceProps) {
  const reduceMotion = useReducedMotion();
  const s = speed > 0 ? speed : 1;

  if (!animate) {
    return <View>{children}</View>;
  }

  // 1.5x speed with the same spring feel: stiffness scales with s^2 and
  // damping with s, keeping the damping ratio (d / 2*sqrt(k)) constant.
  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(Math.round(150 / s))
          : FadeInDown.delay(staggerDelay(index, s))
              .springify()
              .damping(18 * s)
              .stiffness(180 * s * s)
      }
    >
      {children}
    </Animated.View>
  );
}
