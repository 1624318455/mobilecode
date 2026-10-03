const { withAndroidManifest } = require("@expo/config-plugins");

function withAliveService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];

    for (const name of [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
    ]) {
      const exists = manifest["uses-permission"].some(
        (entry) => entry.$ && entry.$["android:name"] === name,
      );

      if (!exists) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }

    const app = manifest.application[0];
    app.service = app.service ?? [];
    const serviceName = "expo.modules.alive.AliveService";
    const exists = app.service.some(
      (entry) => entry.$ && entry.$["android:name"] === serviceName,
    );

    if (!exists) {
      app.service.push({
        $: {
          "android:name": serviceName,
          "android:enabled": "true",
          "android:exported": "false",
          "android:foregroundServiceType": "dataSync",
        },
      });
    }

    return config;
  });
}

module.exports = withAliveService;
