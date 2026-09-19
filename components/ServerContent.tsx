import { useQueryClient } from "@tanstack/react-query";
import { router, useNavigation } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useEffect } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { ProjectSessions } from "@/components/ProjectSessions";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { useServerDirectories } from "@/hooks/useServerDirectories";
import { Server, useAppStore } from "@/stores";

interface ServerContentProps {
  server: Server;
}

export function ServerContent({ server }: ServerContentProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const removeServer = useAppStore((s) => s.removeServer);

  const {
    data: projects = [],
    isLoading,
    isFetching,
    error,
  } = useServerDirectories(server);

  useEffect(() => {
    navigation.setOptions({
      title: server.name,
    });
  }, [navigation, server]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["server", server.url],
    });
  };

  const handleDeleteServer = () => {
    Alert.alert(
      t("serverContent.deleteTitle"),
      t("serverContent.deleteMsg", { name: server.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            removeServer(server.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <FlatList
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      data={projects}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View
          className="rounded-[28px] p-4 mb-4"
          style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
        >
          <ProjectSessions project={item} server={server} />
        </View>
      )}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={handleRefresh} />
      }
      ListHeaderComponent={
        error ? (
          <View
            className="rounded-[28px] p-4 mb-4"
            style={{ backgroundColor: theme.colors.errorContainer }}
          >
            <Text style={{ color: theme.colors.onErrorContainer }}>
              {error.message}
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        isLoading ? (
          <View className="py-12 items-center">
            <Text
              className="mt-3"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("serverContent.loading")}
            </Text>
          </View>
        ) : (
          <View className="py-12 items-center">
            <Text
              className="text-center"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("serverContent.empty")}
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        <>
          <View
            className="rounded-[28px] p-4 mb-4 mt-8"
            style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
          >
            <Text
              className="text-sm"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("serverContent.urlLabel")}
            </Text>
            <Text
              className="text-base mt-1"
              style={{ color: theme.colors.onSurface }}
            >
              {server.url}
            </Text>
          </View>

          <Pressable
            onPress={handleDeleteServer}
            className="rounded-[28px] p-4 flex-row items-center justify-center"
            style={{ backgroundColor: theme.colors.errorContainer }}
          >
            <Trash2 size={20} color={theme.colors.onErrorContainer} />
            <Text
              className="ml-3 font-medium"
              style={{ color: theme.colors.onErrorContainer }}
            >
              {t("serverContent.delete")}
            </Text>
          </Pressable>
        </>
      }
    />
  );
}
