import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
} from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { EmptyState } from "@/components/EmptyState";
import { RecentRow } from "@/components/RecentRow";
import { SkeletonRows } from "@/components/SkeletonRows";
import { fetchProviders } from "@/hooks/useModels";
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
  const { recentSessions, isLoading, listError, fetchInfo } = useAllSessions(servers);
  const redirected = useRef(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [scrolled, setScrolled] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // An empty snapshot with no error is suspicious (server index may not have
  // been ready on first hit): revalidate once automatically so the user never
  // has to pull-to-refresh to fix it. Reset per server set.
  const revalidated = useRef(false);

  useEffect(() => {
    revalidated.current = false;
  }, [servers.length]);

  // Warm the provider catalog (6MB on some servers) while the user is still
  // on the dashboard, so opening a session finds models already cached.
  useEffect(() => {
    servers.forEach((server) => {
      queryClient.prefetchQuery({
        queryKey: ["server", server.url, "providers"],
        queryFn: () => fetchProviders(server),
        staleTime: 5 * 60 * 1000,
      });
    });
  }, [servers, queryClient]);

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

  useEffect(() => {
    if (
      isLoading ||
      listError ||
      totalCount > 0 ||
      servers.length === 0 ||
      revalidated.current
    ) {
      return;
    }

    revalidated.current = true;
    const id = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: ["server"],
      });
    }, 2500);

    return () => clearTimeout(id);
  }, [isLoading, listError, totalCount, servers.length, queryClient]);

  const handleEndReached = useCallback(() => {
    // onEndReached fires on mount when content is shorter than the viewport
    // (e.g. an empty list): never let it clamp the count down to zero.
    if (totalCount === 0) {
      return;
    }

    setVisibleCount((c) => Math.min(Math.max(c, PAGE_SIZE) + PAGE_STEP, totalCount));
  }, [totalCount]);

  const handleRetry = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
    queryClient.invalidateQueries({
      queryKey: ["server"],
    });
  }, [queryClient]);

  const visibleSessions = recentSessions.slice(
    0,
    Math.max(visibleCount, PAGE_SIZE),
  );

  // Group the visible page by device, keeping first-seen order (= most
  // recently active device first, since visibleSessions is time-sorted).
  const sections = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, RecentSession[]>();
    for (const s of visibleSessions) {
      const group = groups.get(s.serverId);
      if (group) {
        group.push(s);
      } else {
        groups.set(s.serverId, [s]);
        order.push(s.serverId);
      }
    }

    const totals = new Map<string, number>();
    for (const s of recentSessions) {
      totals.set(s.serverId, (totals.get(s.serverId) ?? 0) + 1);
    }

    return order.map((serverId) => {
      const items = groups.get(serverId) ?? [];
      return {
        serverId,
        serverName: items[0]?.serverName ?? serverId,
        total: totals.get(serverId) ?? items.length,
        data: collapsed.has(serverId) ? [] : items,
      };
    });
  }, [visibleSessions, recentSessions, collapsed]);

  const toggleSection = useCallback((serverId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: RecentSession; index: number }) => (
      <RecentRow item={item} index={index} animate={!scrolled} showServer={false} />
    ),
    [scrolled],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { serverId: string; serverName: string; total: number } }) => {
      const isCollapsed = collapsed.has(section.serverId);
      const Icon = isCollapsed ? ChevronRight : ChevronDown;
      return (
        <Pressable
          onPress={() => toggleSection(section.serverId)}
          className="flex-row items-center py-2"
          style={{ backgroundColor: theme.colors.surface }}
          accessibilityRole="button"
          accessibilityLabel={section.serverName}
        >
          <Icon size={18} color={theme.colors.onSurfaceVariant} />
          <Text
            className="text-base font-semibold ml-1 flex-1"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {section.serverName}
          </Text>
          <Text
            className="text-xs ml-2"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("serverContent.sessionCount", { n: section.total })}
          </Text>
        </Pressable>
      );
    },
    [collapsed, theme, t, toggleSection],
  );

  return (
    <SectionList
      className="flex-1"
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ padding: 16, flexGrow: 1 }}
      sections={sections}
      keyExtractor={(item) =>
        `${item.serverId}-${item.projectId}-${item.sessionId}`
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      onScrollBeginDrag={() => setScrolled(true)}
      stickySectionHeadersEnabled
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
      }
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      ListEmptyComponent={
        isLoading ? (
          <SkeletonRows count={5} />
        ) : listError ? (
          <View className="flex-1 items-center justify-center py-12 px-8">
            <Text
              className="text-center"
              style={{ color: theme.colors.error }}
            >
              {listError instanceof Error ? listError.message : String(listError)}
            </Text>
            <Pressable
              onPress={handleRetry}
              className="rounded-[28px] px-6 py-3 mt-4"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Text
                className="font-semibold"
                style={{ color: theme.colors.onPrimary }}
              >
                {t("diagnostics.retry")}
              </Text>
            </Pressable>
          </View>
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
