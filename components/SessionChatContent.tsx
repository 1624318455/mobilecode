import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Settings } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatMessage } from "@/components/ChatMessage";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { EmptyState } from "@/components/EmptyState";
import { BubbleSkeleton } from "@/components/SkeletonRows";
import { useT } from "@/lib/i18n";
import { MentionedFile, MessageInput } from "@/components/MessageInput";
import { PermissionBanner } from "@/components/PermissionBanner";
import { QuestionBanner } from "@/components/QuestionBanner";
import { useAgents } from "@/hooks/useAgents";
import { useModels } from "@/hooks/useModels";
import { usePermissions } from "@/hooks/usePermissions";
import { useProjects } from "@/hooks/useProjects";
import { useQuestions } from "@/hooks/useQuestions";
import { useSessionMessages } from "@/hooks/useSessionMessages";
import { Identifier } from "@/lib/id";
import { createClient } from "@/lib/opencode-client";
import { Server } from "@/stores";
import { usePickerStore } from "@/stores/picker";

interface SessionChatContentProps {
  server: Server;
  sessionId: string;
  projectId: string;
}

export function SessionChatContent({
  server,
  sessionId,
  projectId,
}: SessionChatContentProps) {
  const queryClient = useQueryClient();
  const theme = useAppTheme();
  const { t } = useT();
  const flatListRef = useRef<FlatList>(null);
  // Distance between the top of the screen and the top of the KeyboardAvoidingView
  const headerHeight = useHeaderHeight();

  const selectedAgent = usePickerStore((s) => s.selectedAgent);  const selectedModel = usePickerStore((s) => s.selectedModel);
  const setAgents = usePickerStore((s) => s.setAgents);
  const setModels = usePickerStore((s) => s.setModels);
  const setSelectedAgent = usePickerStore((s) => s.setSelectedAgent);
  const setSelectedModel = usePickerStore((s) => s.setSelectedModel);

  const { data: projects = [] } = useProjects(server);

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

  const projectPath =
    projects.find((p) => p.id === projectId)?.worktree ||
    session?.directory ||
    (session as { location?: { directory?: string } } | undefined)?.location
      ?.directory ||
    undefined;

  const sessionTitle =
    session?.title || `Session ${sessionId?.slice(0, 8) || "Chat"}`;

  const {
    data: messages = [],
    isLoading,
    error,
  } = useSessionMessages(server, sessionId);

  const { data: agents = [] } = useAgents(server);
  const { data: models = [] } = useModels(server);
  const { data: pendingQuestions = [] } = useQuestions(server, sessionId);
  const { data: pendingPermissions = [] } = usePermissions(server, sessionId);

  // Sync agents and models to the picker store
  useEffect(() => {
    setAgents(agents);
  }, [agents, setAgents]);

  useEffect(() => {
    setModels(models);
  }, [models, setModels]);

  const sortedMessages = useMemo(
    () =>
      [...messages]
        .sort((a, b) => a.info.id.localeCompare(b.info.id))
        .reverse(),
    [messages],
  );

  const renderMessage = useCallback(
    ({ item }: { item: (typeof sortedMessages)[number] }) => (
      <ChatMessage message={item} />
    ),
    [],
  );

  const latestUserMessage = sortedMessages.find((m) => m.info.role === "user");
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

  // Track the latest user message by id: whenever a NEWER user message
  // arrives (initial load finishing late, or a just-sent message), sync the
  // agent/model pickers from it. A user override made through the picker
  // survives because the message id does not change underneath it.
  // Sessions with no user message yet fall back to the first model so the
  // picker never renders empty.
  const appliedMessageId = useRef<string | null>(null);
  useEffect(() => {
    if (models.length === 0) {
      return;
    }

    if (
      !latestUserMessage ||
      latestUserMessage.info.role !== "user" ||
      latestUserMessage.info.id === appliedMessageId.current
    ) {
      if (!latestUserMessage && appliedMessageId.current !== "none") {
        if (!selectedModel) {
          setSelectedModel(models[0]);
        }

        appliedMessageId.current = "none";
      }

      return;
    }

    const agentFromMessage = latestUserMessage.info.agent;

    if (
      agentFromMessage &&
      agents.some((a) => a.name === agentFromMessage)
    ) {
      setSelectedAgent(agentFromMessage);
    }

    if (models.length > 0) {
      const matchFromMessage = models.find(
        (m) =>
          m.id === currentModel.modelID &&
          m.providerID === currentModel.providerID,
      );

      setSelectedModel(matchFromMessage || models[0]);
    }

    appliedMessageId.current = latestUserMessage.info.id;
  }, [
    agents,
    currentModel.modelID,
    currentModel.providerID,
    latestUserMessage,
    models,
    selectedModel,
    setSelectedAgent,
    setSelectedModel,
  ]);

  const modelForSend = selectedModel
    ? { modelID: selectedModel.id, providerID: selectedModel.providerID }
    : currentModel;

  // What the chip shows: prefer the picked model, but fall back to the model
  // recorded on the latest user message so the name is correct on first paint
  // instead of waiting for the provider catalog.
  const displayModel =
    selectedModel ||
    (latestUserMessage?.info.role === "user"
      ? {
          id: latestUserMessage.info.model.modelID,
          providerID: latestUserMessage.info.model.providerID,
          name: latestUserMessage.info.model.modelID,
        }
      : undefined);

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      text,
      files,
    }: {
      text: string;
      files: MentionedFile[];
    }) => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });

      const messageID = Identifier.ascending("message");
      const parts: (
        | { id: string; type: "text"; text: string }
        | {
            id: string;
            type: "file";
            mime: string;
            url: string;
            filename: string;
            source: {
              type: "file";
              path: string;
              text: { value: string; start: number; end: number };
            };
          }
      )[] = [
        {
          id: Identifier.ascending("part"),
          type: "text",
          text,
        },
      ];

      for (const file of files) {
        const filePath = file.path.startsWith("/")
          ? file.path
          : `${(projectPath || "").replace(/[\\/]+$/, "")}/${file.path}`;
        const filename = file.path.split("/").pop() || file.path;

        parts.push({
          id: Identifier.ascending("part"),
          type: "file",
          mime: "text/plain",
          url: `file://${filePath}`,
          filename,
          source: {
            type: "file",
            path: filePath,
            text: {
              value: `@${file.path}`,
              start: 0,
              end: file.path.length + 1,
            },
          },
        });
      }

      const result = await client.session.promptAsync({
        sessionID: sessionId,
        messageID,
        agent: selectedAgent,
        model: modelForSend,
        parts,
      });

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", sessionId, "messages"],
      });
    },
  });

  const handleSend = useCallback(
    (text: string, files: MentionedFile[]) => {
      sendMessageMutation.mutate({ text, files });
    },
    [sendMessageMutation],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: sessionTitle,
          headerRight: () => (
            <Pressable
              onPress={() =>
                router.push(
                  `/server/${server.id}/project/${projectId}/session/${sessionId}/settings`,
                )
              }
              className="p-2"
              accessibilityLabel={t("a11y.sessionSettings")}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Settings size={24} color={theme.colors.primary} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.colors.surface }}
        edges={["bottom"]}
      >
        <KeyboardAvoidingView
          behavior="translate-with-padding"
          className="flex-1"
          keyboardVerticalOffset={headerHeight}
        >
          <View
            className="flex-1"
            style={{ backgroundColor: theme.colors.surface }}
          >
            <FlatList
              ref={flatListRef}
              data={sortedMessages}
              keyExtractor={(item) => item.info.id}
              inverted={true}
              renderItem={renderMessage}
              contentContainerStyle={{ padding: 16, flexGrow: 1 }}
              ListEmptyComponent={
                isLoading ? (
                  <BubbleSkeleton />
                ) : error ? (
                  <View className="flex-1 items-center justify-center p-4">
                    <Text
                      className="text-center"
                      style={{ color: theme.colors.error }}
                    >
                      {(error as Error).message}
                    </Text>
                  </View>
                ) : (
                  <EmptyState
                    kind="chat"
                    title={t("chat.emptyTitle")}
                    body={t("chat.emptyBody")}
                  />
                )
              }
            />

            {pendingPermissions.map((permission) => (
              <PermissionBanner
                key={permission.id}
                request={permission}
                server={server}
              />
            ))}

            {pendingQuestions.map((question) => (
              <QuestionBanner
                key={question.id}
                request={question}
                server={server}
              />
            ))}

            <MessageInput
              onSend={handleSend}
              disabled={sendMessageMutation.isPending}
              selectedAgent={selectedAgent}
              selectedModel={displayModel}
              server={server}
              projectPath={projectPath}
            />
            {sendMessageMutation.error && (
              <Text
                className="text-sm text-center px-4 pb-2"
                style={{ color: theme.colors.error }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {t("feedback.sendFailed")}
              </Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
