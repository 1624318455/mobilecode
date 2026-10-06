import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  Button,
  HelperText,
  List,
  Text,
  TextInput,
} from "react-native-paper";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { isPairConnectLink, parseQrPayload } from "@/lib/protocol";
import { useLanSweep } from "@/hooks/useLanSweep";
import { usePairing } from "@/hooks/usePairing";
import { useAppStore } from "@/stores";

type PairMethod = "qr" | "link" | "key";

const METHOD_TABS: { value: PairMethod; labelKey: string }[] = [
  { value: "qr", labelKey: "pair.mQr" },
  { value: "link", labelKey: "pair.mLink" },
  { value: "key", labelKey: "pair.mKey" },
];

// NOTE: remote connection modes (cloudflared / self-proxy) are not
// implemented — every request goes straight to server.url (see usePairing).
// Only LAN pairing is offered; the stored provider field stays for compat.

export default function PairServerScreen() {
  const { t } = useT();
  const theme = useAppTheme();
  const [method, setMethod] = useState<PairMethod>("link");
  const [customName, setCustomName] = useState("");
  const [qrJson, setQrJson] = useState("");
  const [link, setLink] = useState("");
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [pairUser, setPairUser] = useState("");
  const [pairPass, setPairPass] = useState("");
  const [port, setPort] = useState("4096");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const servers = useAppStore((s) => s.servers);
  const lastSeenIp = useAppStore((s) => s.lastSeenIp);

  const { pairing, error, pairWithQr, pairWithLink, pairWithKey, reset } =
    usePairing();
  const {
    scanning,
    scanned,
    total,
    hosts,
    localIp,
    error: sweepError,
    scan,
    cancel,
  } = useLanSweep();

  const savedOrigins = useMemo(() => {
    return new Set(servers.map((s) => s.url));
  }, [servers]);

  const handleScanPress = async () => {
    setScanError(null);

    const res = cameraPermission?.granted
      ? { granted: true as boolean }
      : await requestCameraPermission();

    if (res.granted) {
      scannedRef.current = false;
      setScanOpen(true);
    } else {
      setScanError(t("pair.cameraDenied"));
    }
  };

  // Mirrors what pairWithQr accepts (v2 connect link or legacy JSON
  // payload) so invalid codes are rejected before any pairing attempt.
  const isAcceptableQr = (raw: string): boolean => {
    if (isPairConnectLink(raw)) {
      return true;
    }

    try {
      parseQrPayload(raw);
      return true;
    } catch {
      return false;
    }
  };

  const runQrPair = async (content: string) => {
    const result = await pairWithQr(content, customName, "lan", "lan");

    if (result) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scannedRef.current) {
      return;
    }

    scannedRef.current = true;
    const content = result.data.trim();

    // Validate before acting: a non-pair payload must never trigger a
    // pairing attempt. Stay in the scanner so the user can re-aim.
    if (!isAcceptableQr(content)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setScanError(t("pair.scanInvalid"));
      setTimeout(() => {
        scannedRef.current = false;
      }, 1500);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQrJson(content);
    reset();
    setScanOpen(false);
    void runQrPair(content);
  };

  const handlePair = async () => {
    let result = null;

    if (method === "qr") {
      await runQrPair(qrJson);
      return;
    } else if (method === "link") {
      result = await pairWithLink(link, customName, "lan", "lan");
    } else {
      result = await pairWithKey(origin, code, customName, "lan", "lan", {
        username: pairUser,
        password: pairPass,
      });
    }

    if (result) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
        <ScrollView className="p-4">
          <Text
            variant="headlineSmall"
            className="mb-4"
          >
            {t("pair.title")}
          </Text>

          <Text
            variant="labelLarge"
            className="mb-2"
          >
            {t("pair.method")}
          </Text>
          <View
            className="flex-row"
            style={{
              backgroundColor: theme.colors.surfaceVariant,
              borderRadius: 999,
              padding: 4,
              marginBottom: 12,
              gap: 4,
            }}
            accessibilityRole="tablist"
          >
            {METHOD_TABS.map((tab) => {
              const active = method === tab.value;

              return (
                <Pressable
                  key={tab.value}
                  onPress={() => {
                    setMethod(tab.value);
                    reset();
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: active
                      ? theme.colors.primary
                      : "transparent",
                  }}
                >
                  <Text
                    className="text-sm"
                    style={{
                      color: active
                        ? theme.colors.onPrimary
                        : theme.colors.onSurfaceVariant,
                      fontWeight: active ? "700" : "400",
                    }}
                  >
                    {t(tab.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            label={t("pair.deviceName")}
            value={customName}
            onChangeText={setCustomName}
            autoCorrect={false}
            style={{ marginBottom: 12 }}
          />

          {method === "qr" && (
            <>
              <Button
                mode="outlined"
                icon="qrcode-scan"
                onPress={() => {
                  void handleScanPress();
                }}
                style={{ marginBottom: 12 }}
              >
                {t("pair.scanQr")}
              </Button>
              {scanError && (
                <HelperText type="error" visible={true}>
                  {scanError}
                </HelperText>
              )}
              <Modal
                visible={scanOpen}
                animationType="slide"
                onRequestClose={() => setScanOpen(false)}
              >
                <View style={{ flex: 1 }}>
                  <CameraView
                    style={{ flex: 1 }}
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                  <Text
                    variant="labelLarge"
                    className="text-center"
                    style={{ marginVertical: 12 }}
                  >
                    {t("pair.scanHint")}
                  </Text>
                  {scanError && (
                    <HelperText
                      type="error"
                      visible={true}
                      style={{ textAlign: "center" }}
                    >
                      {scanError}
                    </HelperText>
                  )}
                  <Button
                    mode="contained"
                    onPress={() => setScanOpen(false)}
                    style={{ marginHorizontal: 16, marginBottom: 32 }}
                  >
                    {t("common.cancel")}
                  </Button>
                </View>
              </Modal>
              {qrJson ? (
                <HelperText type="info" visible={true}>
                  {t("pair.scannedOk")}
                </HelperText>
              ) : null}
            </>
          )}

          {method === "link" && (
            <TextInput
              label={t("pair.linkLabel")}
              value={link}
              onChangeText={(t) => {
                setLink(t);
                reset();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={t("pair.linkPh")}
              style={{ marginBottom: 12 }}
            />
          )}

          {method === "key" && (
            <View>
              <TextInput
                label={t("pair.originLabel")}
                value={origin}
                onChangeText={(t) => {
                  setOrigin(t);
                  reset();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={t("pair.originPh")}
                style={{ marginBottom: 12 }}
              />
              <TextInput
                label={t("pair.codeLabel")}
                value={code}
                onChangeText={(t) => {
                  setCode(t);
                  reset();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder={t("pair.codePh")}
                style={{ marginBottom: 12 }}
              />
              <TextInput
                label={`${t("newServer.username")} (${t("newServer.optional")})`}
                value={pairUser}
                onChangeText={setPairUser}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ marginBottom: 12 }}
              />
              <TextInput
                label={`${t("newServer.password")} (${t("newServer.optional")})`}
                value={pairPass}
                onChangeText={setPairPass}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={{ marginBottom: 12 }}
              />
            </View>
          )}

          {method === "key" && (
            <View style={{ marginBottom: 12 }}>
              <Text variant="labelLarge" className="mb-2">
                {t("pair.findLan")}
              </Text>
              <TextInput
                label={t("pair.portLabel")}
                value={port}
                onChangeText={setPort}
                autoCorrect={false}
                keyboardType="number-pad"
                style={{ marginBottom: 8 }}
              />
              <Button
                mode="outlined"
                onPress={() => {
                  const parsed = Number.parseInt(port, 10);

                  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
                    return;
                  }

                  scan(parsed, lastSeenIp);
                }}
                loading={scanning}
                disabled={scanning}
                style={{ marginBottom: 8 }}
              >
                {scanning ? t("pair.scanning") : t("pair.scan")}
              </Button>
              {scanning && (
                <>
                  <HelperText type="info" visible={true}>
                    {t("pair.progress", {
                      s: scanned,
                      t: total,
                      f: hosts.length,
                      ip: localIp ? t("pair.thisPhone", { ip: localIp }) : "",
                    })}
                  </HelperText>
                  <Button mode="text" onPress={cancel}>
                    {t("pair.cancel")}
                  </Button>
                </>
              )}
              {sweepError && (
                <HelperText type="error" visible={true}>
                  {sweepError}
                </HelperText>
              )}
              {!scanning && hosts.length === 0 && total > 0 && !sweepError && (
                <HelperText type="info" visible={true}>
                  {t("pair.noneFound", { port })}
                </HelperText>
              )}
              {hosts.map((host) => {
                const saved = savedOrigins.has(host.origin);

                return (
                  <List.Item
                    key={host.ip}
                    title={host.ip}
                    description={`${host.origin} • ${host.latencyMs}ms${saved ? ` • ${t("pair.saved")}` : ""}`}
                    left={(props) => <List.Icon {...props} icon="server" />}
                    onPress={() => {
                      setOrigin(host.origin);
                      reset();
                    }}
                  />
                );
              })}
            </View>
          )}

          {error && (
            <HelperText type="error" visible={true} style={{ marginBottom: 8 }}>
              {error}
            </HelperText>
          )}

          <Button
            mode="contained"
            onPress={handlePair}
            loading={pairing}
            disabled={pairing}
            style={{ marginBottom: 12 }}
          >
            {t("pair.pairBtn")}
          </Button>

          <HelperText type="info" visible={true}>
            {t("pair.cameraNote")}
          </HelperText>
        </ScrollView>
      </KeyboardAwareScrollView>
  );
}
