import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "@/components/Material3ThemeProvider";

const Bones = memo(function Bones() {
  const theme = useAppTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
  }, [progress]);

  const boneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.35, 0.7]),
  }));
  const boneColor = { backgroundColor: theme.colors.surfaceContainerHighest };

  return (
    <View
      className="rounded-2xl p-4 mb-3 flex-row items-center"
      style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
    >
      <Animated.View
        className="w-10 h-10 rounded-lg mr-3"
        style={[boneColor, boneStyle]}
      />
      <View className="flex-1 gap-2">
        <Animated.View
          className="h-4 rounded"
          style={[{ width: "70%" }, boneColor, boneStyle]}
        />
        <Animated.View
          className="h-3 rounded"
          style={[{ width: "45%" }, boneColor, boneStyle]}
        />
      </View>
    </View>
  );
});

export const SkeletonRows = memo(function SkeletonRows({
  count = 5,
}: {
  count?: number;
}) {
  return (
    <View className="flex-1 py-4">
      {Array.from({ length: count }, (_, i) => (
        <Bones key={i} />
      ))}
    </View>
  );
});
