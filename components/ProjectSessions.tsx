import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronDown, ChevronUp, Folder, Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { SessionCard } from "@/components/SessionCard";
import { useAppTheme } from "@/components/Material3ThemeProvider";
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
}

export function ProjectSessions({ project, server }: ProjectSessionsProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useSessions(
    server,
    project.path,
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
      if (session) {
        router.push(
          `/server/${serverId}/project/${project.id}/session/${session.id}`,
        );
      }
    },
  });

  if (isLoading) {
    return (
      <View>
        <View className="mb-3">
          <View className="flex-row items-center">
            <Folder size={16} color={theme.colors.onSurfaceVariant} />
            <Text
              className="text-sm font-semibold ml-2"
              style={{ color: theme.colors.onSurface }}
            >
              {project.name}
            </Text>
          </View>
          <Text
            className="text-xs ml-6"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {project.path}
          </Text>
        </View>
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  const displayedSessions = showAll ? sessions : sessions.slice(0, 3);
  const hasMore = sessions.length > 3;

  return (
    <View>
      {/* Project Header */}
      <View className="mb-3">
        <View className="flex-row items-center">
          <Folder size={16} color={theme.colors.onSurfaceVariant} />
          <Text
            className="text-sm font-semibold ml-2"
            style={{ color: theme.colors.onSurface }}
          >
            {project.name}
          </Text>
        </View>
        <Text
          className="text-xs ml-6"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {project.path}
        </Text>
      </View>

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
                {t("projectSessions.viewMore", { n: sessions.length - 3 })}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
