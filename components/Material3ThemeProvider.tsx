import { Material3Scheme, Material3Theme, useMaterial3Theme } from "@pchmn/expo-material3-theme";
import { createContext, ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { MD3DarkTheme, MD3LightTheme, MD3Theme, Provider as PaperProvider, ProviderProps, useTheme } from "react-native-paper";

interface Material3ContextValue {
  theme: Material3Theme;
  updateTheme: (sourceColor: string) => void;
  resetTheme: () => void;
}

const Material3Context = createContext<Material3ContextValue>(
  {} as Material3ContextValue,
);

type Material3ThemeProviderProps = ProviderProps & {
  children: ReactNode;
  sourceColor?: string;
  fallbackSourceColor?: string;
};

export function Material3ThemeProvider({
  children,
  sourceColor,
  fallbackSourceColor,
  ...otherProps
}: Material3ThemeProviderProps) {
  const colorScheme = useColorScheme();
  const { theme, updateTheme, resetTheme } = useMaterial3Theme({
    sourceColor,
    fallbackSourceColor,
  });

  const paperTheme = useMemo(() => {
    if (colorScheme === "dark") {
      return { ...MD3DarkTheme, colors: theme.dark };
    }

    // Coinbase full lock (light only; dark stays dynamic until arranged).
    // Every role below comes from the Coinbase DESIGN.md or its neutral set;
    // nothing is left to the wallpaper seed except dark mode.
    return {
      ...MD3LightTheme,
      colors: {
        ...theme.light,
        primary: "#0052FF",
        onPrimary: "#FFFFFF",
        primaryContainer: "#DCE6FF",
        onPrimaryContainer: "#002B8F",
        secondary: "#5B616E",
        onSecondary: "#FFFFFF",
        secondaryContainer: "#EEF0F3",
        onSecondaryContainer: "#0A0B0D",
        tertiary: "#05B169",
        onTertiary: "#FFFFFF",
        tertiaryContainer: "#D9F2E4",
        onTertiaryContainer: "#0A4D2E",
        error: "#CF202F",
        onError: "#FFFFFF",
        errorContainer: "#FBE3E4",
        onErrorContainer: "#8F1D22",
        background: "#FFFFFF",
        onBackground: "#0A0B0D",
        surface: "#FFFFFF",
        onSurface: "#0A0B0D",
        surfaceVariant: "#EEF0F3",
        onSurfaceVariant: "#5B616E",
        surfaceDisabled: "#A8B8CC",
        onSurfaceDisabled: "#FFFFFF",
        surfaceContainerLowest: "#FFFFFF",
        surfaceContainerLow: "#F7F9FF",
        surfaceContainer: "#EFF4FF",
        surfaceContainerHigh: "#E4ECFF",
        surfaceContainerHighest: "#DCE6FF",
        outline: "#7C828A",
        outlineVariant: "#DEE1E6",
        inverseSurface: "#0A0B0D",
        inverseOnSurface: "#FFFFFF",
        inversePrimary: "#4ADE80",
        shadow: "#0A0B0D",
        scrim: "#0A0B0D",
        elevation: {
          level0: "#FFFFFF",
          level1: "#FFFFFF",
          level2: "#FFFFFF",
          level3: "#F7F9FF",
          level4: "#EFF4FF",
          level5: "#EFF4FF",
        },
      },
    };
  }, [colorScheme, theme]);

  return (
    <Material3Context.Provider value={{ theme, updateTheme, resetTheme }}>
      <PaperProvider theme={paperTheme} {...otherProps}>
        {children}
      </PaperProvider>
    </Material3Context.Provider>
  );
}

export function useMaterial3ThemeContext(): Material3ContextValue {
  const ctx = useContext(Material3Context);

  if (!ctx) {
    throw new Error(
      "useMaterial3ThemeContext must be used inside Material3ThemeProvider",
    );
  }

  return ctx;
}

export const useAppTheme = useTheme<MD3Theme & { colors: Material3Scheme }>;
