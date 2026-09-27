import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, Shield } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import type { PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { sessionDirectory } from "@/hooks/useAllSessions";
import { useT } from "@/lib/i18n";
import { createClient } from "@/lib/opencode-client";
import type { AggregateResult } from "@/lib/sessionAggregate";
import { isAskStale } from "@/lib/staleAsk";
import { Server } from "@/stores";

interface AskCardProps {
  server: Server;
}

function CardShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();

  return (
    <View
      className="mt-2 w-full px-4 py-3 gap-2"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        borderRadius: 28,
        borderWidth: 1,
      }}
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <View className="flex-1">
          <Text
            className="text-sm font-semibold"
            style={{ color: theme.colors.onSurface }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="text-xs"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export function QuestionInlineCard({
  request,
  server,
}: AskCardProps & { request: QuestionRequest }) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<string[][]>(() =>
    request.questions.map(() => []),
  );
  const [customInputs, setCustomInputs] = useState<string[]>(() =>
    request.questions.map(() => ""),
  );

  const replyMutation = useMutation({
    mutationFn: async (answers: string[][]) => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.question.reply({
        requestID: request.id,
        answers,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "questions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "messages"],
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.question.reject({
        requestID: request.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "questions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "messages"],
      });
    },
  });

  const isPending = replyMutation.isPending || rejectMutation.isPending;

  function toggleOption(questionIndex: number, label: string) {
    setSelections((prev) => {
      const updated = [...prev];
      const current = updated[questionIndex] ?? [];
      const question = request.questions[questionIndex];
      const isMultiple = question?.multiple ?? false;

      if (current.includes(label)) {
        updated[questionIndex] = current.filter((l) => l !== label);
      } else if (isMultiple) {
        updated[questionIndex] = [...current, label];
      } else {
        updated[questionIndex] = [label];
      }

      return updated;
    });
  }

  function handleSubmit() {
    const answers = request.questions.map((q, i) => {
      const selected = selections[i] ?? [];
      const customText = (customInputs[i] ?? "").trim();

      if (customText && q.custom !== false) {
        return [...selected, customText];
      }

      return selected;
    });

    replyMutation.mutate(answers);
  }

  const canSubmit =
    selections.some((s) => s.length > 0) ||
    customInputs.some((text) => text.trim().length > 0);

  return (
    <CardShell
      icon={<MessageCircleQuestion size={18} color={theme.colors.primary} />}
      title={t("tools.questions")}
      subtitle={t("tools.questionsCount", {
        n: request.questions.length,
        s: request.questions.length > 1 ? "s" : "",
      })}
    >
      {request.questions.map((q, qi) => (
        <View key={qi} className="gap-1 mt-1">
          <Text
            className="text-xs font-semibold"
            style={{ color: theme.colors.onSurface }}
          >
            {q.question}
          </Text>
          <View className="flex-row flex-wrap gap-1">
            {q.options.map((opt) => {
              const selected = (selections[qi] ?? []).includes(opt.label);

              return (
                <Pressable
                  key={opt.label}
                  disabled={isPending}
                  onPress={() => {
                    toggleOption(qi, opt.label);
                  }}
                  className="px-3 py-1"
                  style={{
                    backgroundColor: selected
                      ? theme.colors.primaryContainer
                      : theme.colors.surfaceContainerHigh,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    className="text-xs"
                    style={{
                      color: selected
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurface,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {q.custom !== false ? (
            <TextInput
              value={customInputs[qi] ?? ""}
              editable={!isPending}
              onChangeText={(text) => {
                setCustomInputs((prev) => {
                  const updated = [...prev];
                  updated[qi] = text;

                  return updated;
                });
              }}
              placeholder={t("question.customPh")}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              className="px-3 py-1 text-xs"
              style={{
                borderColor: theme.colors.outline,
                borderRadius: 12,
                borderWidth: 1,
                color: theme.colors.onSurface,
              }}
            />
          ) : null}
        </View>
      ))}
      <View className="flex-row gap-2 mt-1">
        <Pressable
          disabled={isPending || !canSubmit}
          onPress={handleSubmit}
          className="flex-1 items-center px-3 py-2"
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 999,
            opacity: isPending || !canSubmit ? 0.5 : 1,
          }}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <Text
              className="text-xs font-semibold"
              style={{ color: theme.colors.onPrimary }}
            >
              {t("question.submit")}
            </Text>
          )}
        </Pressable>
        <Pressable
          disabled={isPending}
          onPress={() => {
            rejectMutation.mutate();
          }}
          className="items-center px-3 py-2"
          style={{
            borderColor: theme.colors.outline,
            borderRadius: 999,
            borderWidth: 1,
          }}
        >
          <Text
            className="text-xs"
            style={{ color: theme.colors.onSurface }}
          >
            {t("question.dismiss")}
          </Text>
        </Pressable>
      </View>
    </CardShell>
  );
}

export function PermissionInlineCard({
  request,
  server,
}: AskCardProps & { request: PermissionRequest }) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: async ({ reply }: { reply: "once" | "always" | "reject" }) => {
      const cached =
        queryClient.getQueryData<AggregateResult>(
          aggregateQueryKey(server.url),
        );
      const found = cached?.sessions.find((s) => s.id === request.sessionID);
      const directory = found ? sessionDirectory(found) : "";
      const client = createClient({
        baseUrl: server.url,
        directory: directory || undefined,
        username: server.username,
        password: server.password,
      });

      return client.permission.reply({
        requestID: request.id,
        reply,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "permissions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["server", server.url, "session", request.sessionID, "messages"],
      });
    },
  });

  const isPending = replyMutation.isPending;

  if (
    isAskStale(
      queryClient,
      server.url,
      request.sessionID,
      request.tool?.messageID,
    )
  ) {
    return null;
  }

  return (
    <CardShell
      icon={<Shield size={18} color={theme.colors.primary} />}
      title={request.permission}
      subtitle={request.patterns.join(", ") || undefined}
    >
      <View className="flex-row gap-2">
        <Pressable
          disabled={isPending}
          onPress={() => {
            replyMutation.mutate({ reply: "once" });
          }}
          className="flex-1 items-center px-3 py-2"
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 999,
            opacity: isPending ? 0.5 : 1,
          }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: theme.colors.onPrimary }}
          >
            {t("permission.allow")}
          </Text>
        </Pressable>
        <Pressable
          disabled={isPending}
          onPress={() => {
            replyMutation.mutate({ reply: "always" });
          }}
          className="flex-1 items-center px-3 py-2"
          style={{
            borderColor: theme.colors.outline,
            borderRadius: 999,
            borderWidth: 1,
          }}
        >
          <Text
            className="text-xs"
            style={{ color: theme.colors.onSurface }}
          >
            {t("permission.always")}
          </Text>
        </Pressable>
        <Pressable
          disabled={isPending}
          onPress={() => {
            replyMutation.mutate({ reply: "reject" });
          }}
          className="items-center px-3 py-2"
          style={{
            borderColor: theme.colors.error,
            borderRadius: 999,
            borderWidth: 1,
          }}
        >
          <Text
            className="text-xs"
            style={{ color: theme.colors.error }}
          >
            {t("permission.reject")}
          </Text>
        </Pressable>
      </View>
    </CardShell>
  );
}
