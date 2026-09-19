import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  Button,
  HelperText,
  List,
  SegmentedButtons,
  Text,
  TextInput,
} from "react-native-paper";

import { useT } from "@/lib/i18n";
import { useLanSweep } from "@/hooks/useLanSweep";
import { PairMode, PairProvider, usePairing } from "@/hooks/usePairing";
import { useAppStore } from "@/stores";

type PairMethod = "qr" | "link" | "key";

const PROVIDERS: { value: PairProvider; key: string }[] = [
  { value: "lan", key: "pair.pLan" },
  { value: "cloudflared-quick", key: "pair.pQuick" },
  { value: "cloudflared-named", key: "pair.pNamed" },
  { value: "self-proxy", key: "pair.pProxy" },
];

export default function PairServerScreen() {
  const { t } = useT();
  const [method, setMethod] = useState<PairMethod>("link");
  const [mode, setMode] = useState<PairMode>("lan");
  const [provider, setProvider] = useState<PairProvider>("lan");
  const [customName, setCustomName] = useState("");
  const [qrJson, setQrJson] = useState("");
  const [link, setLink] = useState("");
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [pairUser, setPairUser] = useState("");
  const [pairPass, setPairPass] = useState("");
  const [port, setPort] = useState("4096");
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

  const handleModeChange = (value: string) => {
    const next = value as PairMode;
    setMode(next);

    if (next === "lan") {
      setProvider("lan");
    } else if (provider === "lan") {
      setProvider("cloudflared-quick");
    }

    reset();
  };

  const handlePair = async () => {
    let result = null;

    if (method === "qr") {
      result = await pairWithQr(qrJson, customName, mode);
    } else if (method === "link") {
      result = await pairWithLink(link, customName, mode, provider);
    } else {
      result = await pairWithKey(origin, code, customName, mode, provider, {
        username: pairUser,
        password: pairPass,
      });
    }

    if (result) {
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
            {t("pair.connection")}
          </Text>
          <SegmentedButtons
            value={mode}
            onValueChange={handleModeChange}
            buttons={[
              { value: "lan", label: t("pair.lan") },
              { value: "remote", label: t("pair.remote") },
            ]}
            style={{ marginBottom: 12 }}
          />

          {mode === "remote" && (
            <>
              <Text
                variant="labelLarge"
                className="mb-2"
              >
                {t("pair.provider")}
              </Text>
              <SegmentedButtons
                value={provider}
                onValueChange={(v) => setProvider(v as PairProvider)}
                buttons={PROVIDERS.filter((p) => p.value !== "lan").map(
                  (p) => ({ value: p.value, label: t(p.key) }),
                )}
                style={{ marginBottom: 12 }}
              />
            </>
          )}

          <Text
            variant="labelLarge"
            className="mb-2"
          >
            {t("pair.method")}
          </Text>
          <SegmentedButtons
            value={method}
            onValueChange={(v) => {
              setMethod(v as PairMethod);
              reset();
            }}
            buttons={[
              { value: "qr", label: t("pair.mQr") },
              { value: "link", label: t("pair.mLink") },
              { value: "key", label: t("pair.mKey") },
            ]}
            style={{ marginBottom: 12 }}
          />

          <TextInput
            label={t("pair.deviceName")}
            value={customName}
            onChangeText={setCustomName}
            autoCorrect={false}
            style={{ marginBottom: 12 }}
          />

          {method === "qr" && (
            <TextInput
              label={t("pair.qrLabel")}
              value={qrJson}
              onChangeText={(t) => {
                setQrJson(t);
                reset();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={4}
              style={{ marginBottom: 12 }}
            />
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

          {mode === "lan" && (
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
                      setMethod("key");
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
