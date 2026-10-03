import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { CheckCircle, Server, XCircle } from "lucide-react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { useTestConnection } from "@/hooks/useTestConnection";
import { useAppStore } from "@/stores";

export default function AddServerScreen() {
  const theme = useAppTheme();
  const { t } = useT();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const addServer = useAppStore((s) => s.addServer);
  const { testing, testResult, error, testConnection, reset } =
    useTestConnection();

  const handleSave = () => {
    if (!name.trim()) {
      setValidationError(t("newServer.needName"));

      return;
    }
    if (!url.trim()) {
      setValidationError(t("newServer.needUrl"));

      return;
    }

    addServer({
      name: name.trim(),
      url: url.trim(),
      username: username.trim() || undefined,
      password: password.trim() || undefined,
      connectionMode: "direct",
    });

    router.back();
  };

  const handleUrlChange = (text: string) => {
    setUrl(text);
    reset();
    setValidationError(null);
  };

  const inputStyle = {
    backgroundColor: theme.colors.surfaceContainerHigh,
    color: theme.colors.onSurface,
    borderRadius: 28,
  };
  const labelStyle = { color: theme.colors.onSurfaceVariant };

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <View className="p-4">
        {/* Server Icon */}
        <View className="items-center py-6">
          <View
            className="w-20 h-20 rounded-[28px] items-center justify-center"
            style={{ backgroundColor: theme.colors.primaryContainer }}
          >
            <Server size={40} color={theme.colors.primary} />
          </View>
        </View>

        {/* Name Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-2" style={labelStyle}>
            {t("newServer.name")} <Text style={{ color: theme.colors.error }}>*</Text>
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("newServer.namePh")}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            autoCorrect={false}
            className="px-4 py-3 text-base"
            style={inputStyle}
          />
        </View>

        {/* URL Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-2" style={labelStyle}>
            {t("newServer.url")} <Text style={{ color: theme.colors.error }}>*</Text>
          </Text>
          <TextInput
            value={url}
            onChangeText={handleUrlChange}
            placeholder="http://192.168.1.100:4001"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            className="px-4 py-3 text-base"
            style={inputStyle}
          />
        </View>

        {/* Username Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-2" style={labelStyle}>
            {t("newServer.username")}
          </Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder={t("newServer.optional")}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            className="px-4 py-3 text-base"
            style={inputStyle}
          />
        </View>

        {/* Password Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-2" style={labelStyle}>
            {t("newServer.password")}
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t("newServer.optional")}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            className="px-4 py-3 text-base"
            style={inputStyle}
          />
        </View>

        {/* Test Connection Button */}
        <Pressable
          onPress={() =>
            testConnection({
              url,
              username: username.trim() || undefined,
              password: password.trim() || undefined,
            })
          }
          disabled={testing}
          className="rounded-[28px] py-3 flex-row items-center justify-center mb-4"
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          {testing ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : testResult === "success" ? (
            <>
              <CheckCircle size={20} color={theme.colors.tertiary} />
              <Text
                className="font-medium ml-2"
                style={{ color: theme.colors.tertiary }}
              >
                {t("newServer.success")}
              </Text>
            </>
          ) : testResult === "error" ? (
            <>
              <XCircle size={20} color={theme.colors.error} />
              <Text
                className="font-medium ml-2"
                style={{ color: theme.colors.error }}
              >
                {t("newServer.failed")}
              </Text>
            </>
          ) : (
            <Text
              className="font-medium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("newServer.test")}
            </Text>
          )}
        </Pressable>

        {/* Error Message */}
        {(error || validationError) && (
          <View
            className="rounded-[28px] p-3 mb-4"
            style={{ backgroundColor: theme.colors.errorContainer }}
          >
            <Text
              className="text-sm"
              style={{ color: theme.colors.onErrorContainer }}
            >
              {error || validationError}
            </Text>
          </View>
        )}

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          className="rounded-[28px] py-4 items-center"
          style={{ backgroundColor: theme.colors.primary }}
        >
          <Text
            className="font-semibold text-base"
            style={{ color: theme.colors.onPrimary }}
          >
            {t("newServer.save")}
          </Text>
        </Pressable>

        {/* Pairing Entry */}
        <Pressable
          onPress={() => router.push("/server/pair")}
          className="rounded-[28px] py-3 items-center mt-4"
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          <Text
            className="font-medium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("newServer.pairInstead")}
          </Text>
        </Pressable>

        {/* Help Text */}
        <View
          className="mt-6 p-4 rounded-[28px]"
          style={{
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
        >
          <Text
            className="text-sm leading-5"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("newServer.help")}
          </Text>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}
