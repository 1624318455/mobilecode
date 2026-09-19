import { router } from "expo-router";
import { memo, useCallback, useEffect, useRef } from "react";
import { Link2, Plus } from "lucide-react-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { DeviceRow } from "@/components/DeviceRow";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { SignatureEntrance } from "@/components/SignatureEntrance";
import { useDeviceRecords } from "@/hooks/useDeviceRecords";
import { DeviceRecord } from "@/lib/protocol";
import { useT } from "@/lib/i18n";
import { Server, useAppStore } from "@/stores";

interface DeviceRowHostProps {
  index: number;
  record: DeviceRecord;
  server: Server;
  checking: boolean;
  onCheckServer: (server: Server) => void;
}

const DeviceRowHost = memo(function DeviceRowHost({
  index,
  record,
  server,
  checking,
  onCheckServer,
}: DeviceRowHostProps) {
  const setLastServerId = useAppStore((s) => s.setLastServerId);

  const handleCheck = useCallback(() => {
    onCheckServer(server);
  }, [onCheckServer, server]);

  const handleOpen = useCallback(() => {
    setLastServerId(server.id);
    router.push(`/(tabs)/servers/${server.id}`);
  }, [setLastServerId, server.id]);

  return (
    <SignatureEntrance index={index}>
      <DeviceRow
        record={record}
        checking={checking}
        onCheck={handleCheck}
        onOpen={handleOpen}
      />
    </SignatureEntrance>
  );
});

export default function ServersScreen() {
  const theme = useAppTheme();
  const { t } = useT();
  const servers = useAppStore((s) => s.servers);
  const { records, checking, check } = useDeviceRecords(servers);
  const autoChecked = useRef<Set<string>>(new Set());

  useEffect(() => {
    servers.forEach((server) => {
      if (!autoChecked.current.has(server.id)) {
        autoChecked.current.add(server.id);
        check(server);
      }
    });
  }, [servers, check]);

  const needsRepair = servers.filter((s) => s.needsRepair);

  const renderItem = useCallback(
    ({ item, index }: { item: DeviceRecord; index: number }) => {
      const server = servers.find((s) => s.id === item.id);

      if (!server) {
        return null;
      }

      return (
        <DeviceRowHost
          index={index}
          record={item}
          server={server}
          checking={!!checking[item.id]}
          onCheckServer={check}
        />
      );
    },
    [servers, checking, check],
  );

  return (
    <FlatList
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      data={records}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <View>
          {needsRepair.length > 0 && (
            <View
              className="rounded-2xl p-3 mb-4"
              style={{ backgroundColor: theme.colors.tertiaryContainer }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: theme.colors.onTertiaryContainer }}
              >
                {needsRepair.length === 1
                  ? t("servers.repairBannerOne", { n: 1 })
                  : t("servers.repairBannerOther", { n: needsRepair.length })}
              </Text>
              <Pressable
                onPress={() => router.push("/server/pair")}
                className="mt-2"
              >
                <Text
                  className="font-semibold text-sm"
                  style={{ color: theme.colors.onTertiaryContainer }}
                >
                  {t("servers.pairAgain")}
                </Text>
              </Pressable>
            </View>
          )}
          <Pressable
            onPress={() => router.push("/server/new")}
            className="rounded-2xl p-4 flex-row items-center justify-center mb-3"
            style={{ backgroundColor: theme.colors.primary }}
          >
            <Plus size={20} color={theme.colors.onPrimary} />
            <Text
              className="font-semibold ml-2"
              style={{ color: theme.colors.onPrimary }}
            >
              {t("servers.addServer")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/server/pair")}
            className="rounded-2xl p-4 flex-row items-center justify-center mb-4"
            style={{ backgroundColor: theme.colors.surfaceVariant }}
          >
            <Link2 size={20} color={theme.colors.primary} />
            <Text
              className="font-semibold ml-2"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("servers.pairComputer")}
            </Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <View className="items-center py-12">
          <Text
            className="text-center"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("servers.empty")}
          </Text>
        </View>
      }
    />
  );
}
