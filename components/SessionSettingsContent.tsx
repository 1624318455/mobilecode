import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useProjects } from "@/hooks/useProjects";
import { useSessionMessages } from "@/hooks/useSessionMessages";
import { createClient } from "@/lib/opencode-client";
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
  const { data: messages = [] } = useSessionMessages(server, sessionId);
  const { data: projects = [] } = useProjects(server);

  const projectPath = projects.find((p) => p.id === projectId)?.worktree;

  const { data: session } = useQuery({
    queryKey: ["server", server.url, "sessions", sessionId],
    queryFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.get({
        sessionID: sessionId,
      });

      return result.data;
    },
  });

  const [title, setTitle] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (session?.title) {
      setTitle(session.title);
    }
  }, [session?.title]);

  const renameMutation = useMutation({
    mutationFn: async (next: string) => {
      const client = createClient({
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
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      await client.session.delete({
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

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });
      await client.session.update({
        sessionID: sessionId,
        time: { archived: Date.now() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url],
      });
      router.dismiss(2);
    },
  });

  const { data: models = [] } = useQuery({
    queryKey: ["server", server.url, "providers"],
    queryFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.provider.list();

      return result.data?.all || [];
    },
    select: (providers) => {
      const allModels: {
        id: string;
        providerID: string;
        name: string;
      }[] = [];

      providers.forEach((provider) => {
        Object.values(provider.models || {}).forEach((model) => {
          allModels.push({
            id: model.id,
            providerID: provider.id,
            name: model.name,
          });
        });
      });

      return allModels;
    },
  });

  const latestUserMessage = [...messages]
    .reverse()
    .find((m) => m.info.role === "user");
  const currentModel =
    latestUserMessage?.info.role === "user"
      ? {
          modelID: latestUserMessage.info.model.modelID,
          providerID: latestUserMessage.info.model.providerID,
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
              className="rounded-2xl p-4 flex-row items-center justify-between"
              style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
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
              className="mt-4 rounded-2xl p-4"
              style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
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
                  className="flex-1 px-3 py-2 rounded-xl text-base"
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
                  className="px-4 py-2 rounded-xl opacity-100 disabled:opacity-50"
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
              onPress={() => {
                Alert.alert(
                  t("sessionSettings.archiveTitle"),
                  t("sessionSettings.archiveMsg"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("sessionSettings.archive"),
                      style: "destructive",
                      onPress: () => archiveMutation.mutate(),
                    },
                  ],
                );
              }}
              disabled={archiveMutation.isPending}
              className="mt-4 rounded-2xl p-4 items-center opacity-100 disabled:opacity-50"
              style={{ backgroundColor: theme.colors.error }}
            >
              <Text
                className="text-base font-medium"
                style={{ color: theme.colors.onError }}
              >
                {archiveMutation.isPending
                  ? t("sessionSettings.archiving")
                  : t("sessionSettings.archive")}
              </Text>
            </Pressable>
            {archiveMutation.error && (
              <Text
                className="text-sm mt-2 text-center"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t("feedback.opFailed")}
              </Text>
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
              className="mt-4 rounded-2xl p-4 items-center opacity-100 disabled:opacity-50"
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
