import { useColorScheme } from "react-native";

// Doc-driven fixed pair (SingSingHow §2.1: orange = ordinary notification).
// Deliberately NOT a dynamic token: the doc requires orange in both modes,
// and no M3 role is orange. Light/dark variants hand-paired for contrast.
const LIGHT = { container: "#FFE8C7", onContainer: "#6B4200", accent: "#B26A00" };
const DARK = { container: "#5C3D00", onContainer: "#FFDDBB", accent: "#FFB95E" };

export function useNotifyColors() {
  const scheme = useColorScheme();

  return scheme === "dark" ? DARK : LIGHT;
}
