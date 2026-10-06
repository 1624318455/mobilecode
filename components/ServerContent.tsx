import { useQueryClient } from "@tanstack/react-query";
import { router, useNavigation } from "expo-router";
import { ChevronDown, Folder, Trash2 } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ProjectSessions } from "@/components/ProjectSessions";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useAggregatedSessions } from "@/hooks/useAggregatedSessions";
import { discoverDirectoryProjects, sessionDirectory } from "@/hooks/useAllSessions";
import type { DirectoryProject } from "@/hooks/useAllSessions";
import { formatTimeAgo } from "@/lib/formatTimeAgo";
import { useT } from "@/lib/i18n";
import { isPrimarySession } from "@/lib/sessionAggregate";
import { normalizeDirectory } from "@/lib/sessionAggregate";
import { Server, useAppStore } from "@/stores";
import { useUnreadStore } from "@/stores/unread";

interface ServerContentProps {
  server: Server;
}

interface ProjectRowProps {
  project: DirectoryProject;
  sessionCount: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  server: Server;
}

const ProjectRow = memo(function ProjectRow({
  project,
  sessionCount,
  expanded,
  onToggle,
  server,
}: ProjectRowProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, { duration: 150 });
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(180).easing(Easing.out(Easing.quad))}
      className="rounded-[28px] p-4 mb-4"
      style={{
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
    >
      <Pressable
        onPress={() => {
          onToggle(project.id);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center"
      >
        <Folder size={18} color={theme.colors.onSurfaceVariant} />
        <View className="flex-1 ml-2">
          <Text
            className="text-sm font-semibold"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          <Text
            className="text-xs"
            style={{ color: theme.colors.onSurfaceVariant }}
            numberOfLines={1}
          >
            {project.path}
          </Text>
        </View>
        <Text
          className="text-xs mr-2"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t("serverContent.sessionCount", { n: sessionCount })}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={18} color={theme.colors.onSurfaceVariant} />
        </Animated.View>
      </Pressable>
      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(110)}
          className="mt-3"
        >
          <ProjectSessions project={project} server={server} expanded />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

export function ServerContent({ server }: ServerContentProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const removeServer = useAppStore((s) => s.removeServer);
  const unreadItems = useUnreadStore((s) => s.items);
  const clearUnread = useUnreadStore((s) => s.clearForServer);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const serverUnread = useMemo(
    () =>
      Object.values(unreadItems).filter((e) => e.serverId === server.id),
    [unreadItems, server.id],
  );

  const {
    data: aggregate,
    isLoading,
    isFetching,
    error,
  } = useAggregatedSessions(server);

  const projects = useMemo(
    () => discoverDirectoryProjects(aggregate?.sessions ?? []),
    [aggregate],
  );

  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const s of aggregate?.sessions ?? []) {
      // Same predicate as the expanded session list: primary sessions only,
      // so the badge always matches what expanding will show.
      if (!isPrimarySession(s)) {
        continue;
      }

      const raw = sessionDirectory(s);

      if (!raw) {
        continue;
      }

      const key = normalizeDirectory(raw);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
  }, [aggregate]);

  // Collapse the expanded project if it disappears from the list.
  useEffect(() => {
    if (expandedId && !projects.some((p) => p.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, projects]);

  const revalidated = useRef(false);

  useEffect(() => {
    if (isLoading || isFetching || error || projects.length > 0 || revalidated.current) {
      return;
    }

    revalidated.current = true;
    const id = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url],
      });
    }, 2500);

    return () => clearTimeout(id);
  }, [isLoading, isFetching, error, projects.length, queryClient, server.url]);

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

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DirectoryProject }) => (
      <ProjectRow
        project={item}
        sessionCount={sessionCounts.get(normalizeDirectory(item.path)) ?? 0}
        expanded={expandedId === item.id}
        onToggle={handleToggle}
        server={server}
      />
    ),
    [expandedId, handleToggle, server, sessionCounts],
  );

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
      renderItem={renderItem}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={handleRefresh} />
      }
      ListHeaderComponent={
        <>
          {serverUnread.length > 0 ? (
            <View
              className="rounded-[28px] p-4 mb-4"
              style={{
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
              }}
            >
              <Text
                className="text-base font-semibold mb-1"
                style={{ color: theme.colors.onSurface }}
              >
                {t("notify.unread")} ({serverUnread.length})
              </Text>
              {serverUnread.map((entry) => (
                <Pressable
                  key={entry.sessionId}
                  onPress={() => {
                    useUnreadStore
                      .getState()
                      .markSeen(entry.serverId, entry.sessionId);
                    router.push({
                      pathname:
                        "/server/[serverId]/project/[projectId]/session/[sessionId]",
                      params: {
                        serverId: entry.serverId,
                        projectId: entry.projectId,
                        sessionId: entry.sessionId,
                      },
                    });
                  }}
                  className="py-2"
                  style={{
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.outlineVariant,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: theme.colors.onSurface }}
                    numberOfLines={1}
                  >
                    {entry.title}
                  </Text>
                  <Text
                    className="text-xs mt-0.5"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {formatTimeAgo(entry.updatedAt, t)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => {
                  clearUnread(server.id);
                }}
                className="rounded-[28px] py-3 items-center mt-2"
                style={{ backgroundColor: theme.colors.surfaceVariant }}
              >
                <Text
                  className="font-medium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {t("notify.clearAll")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {error ? (
            <View
              className="rounded-[28px] p-4 mb-4"
              style={{ backgroundColor: theme.colors.errorContainer }}
            >
              <Text style={{ color: theme.colors.onErrorContainer }}>
                {error.message}
              </Text>
            </View>
          ) : null}
        </>
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
            style={{
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
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
