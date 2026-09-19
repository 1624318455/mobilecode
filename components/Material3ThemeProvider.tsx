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

    return { ...MD3LightTheme, colors: theme.light };
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
