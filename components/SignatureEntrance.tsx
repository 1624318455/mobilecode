import { ReactNode } from "react";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";

export const STAGGER_MS = 60;
export const STAGGER_MAX = 8;

export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX) * STAGGER_MS;
}

interface SignatureEntranceProps {
  index: number;
  children: ReactNode;
}

export function SignatureEntrance({ index, children }: SignatureEntranceProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(150)
          : FadeInDown.delay(staggerDelay(index))
              .springify()
              .damping(18)
              .stiffness(180)
      }
    >
      {children}
    </Animated.View>
  );
}
