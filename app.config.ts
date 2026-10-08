import { ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const bundleIdentifier = IS_DEV
  ? "io.memeflyfly.mobilecode.dev"
  : "io.memeflyfly.mobilecode";

const config: ExpoConfig = {
  name: IS_DEV ? "MobileCode Dev" : "MobileCode",
  slug: "mobilecode",
  version: "0.7",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: "mobilecode",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#000000",
    },
    package: bundleIdentifier,
    permissions: ["POST_NOTIFICATIONS", "android.permission.CAMERA"],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-notifications",
    "./plugins/withAliveService.js",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/icon.png",
        resizeMode: "contain",
        backgroundColor: "#FFFFFF",
        imageWidth: 200,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "333fd236-e054-466d-8b1a-81a16213d955",
    },
  },
  owner: "apuyou",
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    fallbackToCacheTimeout: 3000,
    url: "https://u.expo.dev/333fd236-e054-466d-8b1a-81a16213d955",
  },
};

export default { expo: config };
