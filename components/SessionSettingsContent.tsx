import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useProjects } from "@/hooks/useProjects";
import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { useSessionStatus } from "@/hooks/useSessionStatus";
import { createV2Client } from "@/lib/v2client";
import { sessionDirectoryOf } from "@/lib/v2types";
import { resolveProjectPath } from "@/lib/sessionAggregate";
import { useT } from "@/lib/i18n";
import { Server } from "@/stores";

interface SessionSettingsContentProps {
  server: Server;
  projectId: string;
  sessionId: string;
}

export function SessionSettingsContent({
  server,
  projectId,
  sessionId,
}: SessionSettingsContentProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects(server);

  const { data: session } = useQuery({
    queryKey: ["server", server.url, "sessions", sessionId],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.get({
        sessionID: sessionId,
      });
    },
  });

  const projectPath = resolveProjectPath(
    projectId,
    projects,
    session ? sessionDirectoryOf(session) : undefined,
  );

  const [title, setTitle] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [compactDone, setCompactDone] = useState(false);
  const { data: sessionRun } = useSessionStatus(server, sessionId);
  const sessionBusy = sessionRun?.state != null && sessionRun.state !== "idle";

  useEffect(() => {
    if (session?.title) {
      setTitle(session.title);
    }
  }, [session?.title]);

  const renameMutation = useMutation({
    mutationFn: async (next: string) => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      await client.session.update({
        sessionID: sessionId,
        title: next,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url],
      });
      setJustSaved(true);

      setTimeout(() => {
        setJustSaved(false);
      }, 2500);
    },
    onError: () => {
      setJustSaved(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      await client.session.remove({
        sessionID: sessionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url],
      });
      router.dismiss(2);
    },
  });

  const forkMutation = useMutation({
    mutationFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.fork({
        sessionID: sessionId,
      });
    },
    onSuccess: (fork) => {
      queryClient.invalidateQueries({
        queryKey: aggregateQueryKey(server.url),
      });
      router.replace(
        `/server/${server.id}/project/${projectId}/session/${fork.id}`,
      );
    },
  });

  const compactMutation = useMutation({
    mutationFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.compact({
        sessionID: sessionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", sessionId, "messages"],
      });
      setCompactDone(true);

      setTimeout(() => {
        setCompactDone(false);
      }, 4000);
    },
  });

  const abortMutation = useMutation({
    mutationFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.interrupt({
        sessionID: sessionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", sessionId, "status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", sessionId, "messages"],
      });
    },
  });

  const { data: models = [] } = useQuery({
    queryKey: ["server", server.url, "providers"],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.model.list();

      return result.data
        .filter((m) => m.enabled)
        .map((m) => ({
          id: m.modelID,
          providerID: m.providerID,
          name: m.name,
        }));
    },
  });

  const currentModel = session?.model
    ? {
        modelID: session.model.id,
        providerID: session.model.providerID,
      }
    : {
        modelID: "big-pickle",
        providerID: "opencode",
      };

  const selectedModel = models.find(
    (m) =>
      m.id === currentModel.modelID && m.providerID === currentModel.providerID,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t("sessionSettings.title"),
        }}
      />
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.colors.surface }}
      >
        <ScrollView>
          <View className="p-4">
            <View
              className="rounded-[28px] p-4 flex-row items-center justify-between"
              style={{
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
              }}
            >
              <Text
                className="text-base font-medium"
                style={{ color: theme.colors.onSurface }}
              >
                {t("sessionSettings.model")}
              </Text>
              <Text
                className="text-sm"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {selectedModel?.name || "big-pickle"}
              </Text>
            </View>

            <View
              className="mt-4 rounded-[28px] p-4"
              style={{
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
              }}
            >
              <Text
                className="text-base font-medium mb-2"
                style={{ color: theme.colors.onSurface }}
              >
                {t("sessionSettings.rename")}
              </Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t("sessionSettings.renamePh")}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCorrect={false}
                  className="flex-1 px-3 py-2 rounded-[28px] text-base"
                  style={{
                    backgroundColor: theme.colors.surfaceContainerLowest,
                    color: theme.colors.onSurface,
                    borderWidth: 1,
                    borderColor: theme.colors.outlineVariant,
                  }}
                />
                <Pressable
                  onPress={() => {
                    if (title.trim()) {
                      renameMutation.mutate(title.trim());
                    }
                  }}
                  disabled={renameMutation.isPending || !title.trim()}
                  className="px-4 py-2 rounded-[28px] opacity-100 disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  <Text
                    className="text-base font-medium"
                    style={{ color: theme.colors.onPrimary }}
                  >
                    {t("sessionSettings.save")}
                  </Text>
                </Pressable>
              </View>
              {justSaved && !renameMutation.error && (
                <Text
                  className="text-sm mt-2"
                  style={{ color: theme.colors.tertiary }}
                  accessibilityLiveRegion="polite"
                >
                  {t("feedback.saved")}
                </Text>
              )}
              {renameMutation.error && (
                <Text
                  className="text-sm mt-2"
                  style={{ color: theme.colors.error }}
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                >
                  {t("feedback.opFailed")}
                </Text>
              )}
            </View>

            <Pressable
              onPress={() => forkMutation.mutate()}
              disabled={forkMutation.isPending}
              className="mt-4 rounded-[28px] p-4 items-center opacity-100 disabled:opacity-50"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Text
                className="text-base font-medium"
                style={{ color: theme.colors.onPrimary }}
              >
                {forkMutation.isPending
                  ? t("sessionSettings.forking")
                  : t("sessionSettings.fork")}
              </Text>
            </Pressable>
            {forkMutation.error && (
              <Text
                className="text-sm mt-2 text-center"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {(forkMutation.error as Error).message}
              </Text>
            )}

            <Pressable
              onPress={() => {
                Alert.alert(
                  t("sessionSettings.compactTitle"),
                  t("sessionSettings.compactMsg"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("sessionSettings.compact"),
                      onPress: () => compactMutation.mutate(),
                    },
                  ],
                );
              }}
              disabled={compactMutation.isPending}
              className="mt-4 rounded-[28px] p-4 items-center opacity-100 disabled:opacity-50"
              style={{ backgroundColor: theme.colors.surfaceVariant }}
            >
              <Text
                className="text-base font-medium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {compactMutation.isPending
                  ? t("sessionSettings.compacting")
                  : t("sessionSettings.compact")}
              </Text>
            </Pressable>
            {compactDone && !compactMutation.error && (
              <Text
                className="text-sm mt-2 text-center"
                style={{ color: theme.colors.tertiary }}
                accessibilityLiveRegion="polite"
              >
                {t("sessionSettings.compactDone")}
              </Text>
            )}
            {compactMutation.error && (
              <Text
                className="text-sm mt-2 text-center"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t("feedback.opFailed")}
              </Text>
            )}

            {sessionBusy && (
              <Pressable
                onPress={() => {
                  Alert.alert(
                    t("sessionBusy.abortTitle"),
                    t("sessionBusy.abortMsg"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      {
                        text: t("sessionBusy.abort"),
                        style: "destructive",
                        onPress: () => abortMutation.mutate(),
                      },
                    ],
                  );
                }}
                disabled={abortMutation.isPending}
                className="mt-4 rounded-[28px] p-4 items-center opacity-100 disabled:opacity-50"
                style={{ backgroundColor: theme.colors.surfaceVariant }}
              >
                <Text
                  className="text-base font-medium"
                  style={{ color: theme.colors.error }}
                >
                  {abortMutation.isPending
                    ? t("sessionBusy.aborting")
                    : t("sessionBusy.abort")}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                Alert.alert(
                  t("sessionSettings.deleteTitle"),
                  t("sessionSettings.deleteMsg"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("sessionSettings.delete"),
                      style: "destructive",
                      onPress: () => {
                        Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Warning,
                        );
                        deleteMutation.mutate();
                      },
                    },
                  ],
                );
              }}
              disabled={deleteMutation.isPending}
              className="mt-4 rounded-[28px] p-4 items-center opacity-100 disabled:opacity-50"
              style={{ backgroundColor: theme.colors.errorContainer }}
            >
              <Text
                className="text-base font-medium"
                style={{ color: theme.colors.onErrorContainer }}
              >
                {t("sessionSettings.delete")}
              </Text>
            </Pressable>
            {deleteMutation.error && (
              <Text
                className="text-sm mt-2 text-center"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t("feedback.opFailed")}
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
