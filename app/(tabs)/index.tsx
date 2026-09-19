import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { EmptyState } from "@/components/EmptyState";
import { RecentRow } from "@/components/RecentRow";
import { SkeletonRows } from "@/components/SkeletonRows";
import { RecentSession, useAllSessions } from "@/hooks/useAllSessions";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores";

const PAGE_SIZE = 25;
const PAGE_STEP = 20;

export default function RecentsScreen() {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();
  const servers = useAppStore((s) => s.servers);
  const startupBehavior = useAppStore((s) => s.startupBehavior);
  const lastServerId = useAppStore((s) => s.lastServerId);
  const { recentSessions, isLoading } = useAllSessions(servers);
  const redirected = useRef(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (redirected.current) {
      return;
    }

    if (startupBehavior === "last" && lastServerId) {
      const target = servers.find((s) => s.id === lastServerId);

      if (target) {
        redirected.current = true;
        router.replace(`/(tabs)/servers/${target.id}`);
      }
    }
  }, [startupBehavior, lastServerId, servers]);

  const handleRefresh = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
    servers.forEach((server) => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url],
      });
    });
  }, [servers, queryClient]);

  const totalCount = recentSessions.length;

  const handleEndReached = useCallback(() => {
    setVisibleCount((c) => Math.min(c + PAGE_STEP, totalCount));
  }, [totalCount]);

  const visibleSessions = recentSessions.slice(0, visibleCount);

  const renderItem = useCallback(
    ({ item, index }: { item: RecentSession; index: number }) => (
      <RecentRow item={item} index={index} animate={!scrolled} />
    ),
    [scrolled],
  );

  return (
    <FlatList
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      data={visibleSessions}
      keyExtractor={(item) =>
        `${item.serverId}-${item.projectId}-${item.sessionId}`
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      onScrollBeginDrag={() => setScrolled(true)}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
      }
      renderItem={renderItem}
      ListEmptyComponent={
        isLoading ? (
          <SkeletonRows count={5} />
        ) : (
          <EmptyState
            kind="sessions"
            title={t("recents.emptyTitle")}
            body={t("recents.emptyBody")}
          />
        )
      }
    />
  );
}
