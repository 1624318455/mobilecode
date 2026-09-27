import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronDown, ChevronUp, Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { SessionCard } from "@/components/SessionCard";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { useSessions } from "@/hooks/useSessions";
import { createClient } from "@/lib/opencode-client";
import { useT } from "@/lib/i18n";
import { Server } from "@/stores";

interface Project {
  id: string;
  name: string;
  path: string;
}

interface ProjectSessionsProps {
  project: Project;
  server: Server;
  expanded?: boolean;
}

const PREVIEW_LIMIT = 5;

export function ProjectSessions({ project, server, expanded = true }: ProjectSessionsProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useSessions(
    server,
    project.path,
    expanded,
  );

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        directory: project.path,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.create({
        directory: project.path,
      });

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "project", project.path, "sessions"],
      });
      queryClient.invalidateQueries({
        queryKey: aggregateQueryKey(server.url),
      });
      if (session) {
        router.push(
          `/server/${serverId}/project/${project.id}/session/${session.id}`,
        );
      }
    },
  });

  if (isLoading) {
    // Same footprint as PREVIEW_LIMIT session cards: no height jump when
    // the real list arrives.
    return <SkeletonRows count={PREVIEW_LIMIT} />;
  }

  const displayedSessions = showAll ? sessions : sessions.slice(0, PREVIEW_LIMIT);
  const hasMore = sessions.length > PREVIEW_LIMIT;

  // Note: no project header here — the accordion row in ServerContent
  // already shows name/path/count.
  return (
    <View>
      {/* New Session Button */}
      <Pressable
        onPress={() => createSessionMutation.mutate()}
        disabled={createSessionMutation.isPending}
        className="rounded-[28px] p-3 flex-row items-center mb-2"
        style={{ backgroundColor: theme.colors.secondaryContainer }}
      >
        {createSessionMutation.isPending ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Plus size={18} color={theme.colors.primary} />
        )}
        <Text
          className="ml-2 text-sm font-medium"
          style={{ color: theme.colors.onSecondaryContainer }}
        >
          {t("projectSessions.newSession")}
        </Text>
      </Pressable>
      {createSessionMutation.error && (
        <Text
          className="text-xs mt-1 mb-2"
          style={{ color: theme.colors.error }}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {t("feedback.createFailed")}
        </Text>
      )}

      {/* Sessions for this project */}
      {displayedSessions.map((session) => (
        <SessionCard
          key={session.id}
          serverId={server.id}
          sessionId={session.id}
          title={session.title}
          updatedAt={session.updatedAt}
          onPress={() =>
            router.push(
              `/server/${serverId}/project/${project.id}/session/${session.id}`,
            )
          }
        />
      ))}

      {/* View More/Less Button */}
      {hasMore && (
        <Pressable
          onPress={() => setShowAll(!showAll)}
          className="rounded-[28px] p-3 flex-row items-center justify-center mt-2"
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          {showAll ? (
            <>
              <ChevronUp size={16} color={theme.colors.onSurfaceVariant} />
              <Text
                className="ml-2 text-sm"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("projectSessions.showLess")}
              </Text>
            </>
          ) : (
            <>
              <ChevronDown size={16} color={theme.colors.onSurfaceVariant} />
              <Text
                className="ml-2 text-sm"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("projectSessions.viewMore", { n: sessions.length - PREVIEW_LIMIT })}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
