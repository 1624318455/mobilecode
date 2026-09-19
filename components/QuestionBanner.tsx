import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, X } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { QuestionRequest } from "@opencode-ai/sdk/v2";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { createClient } from "@/lib/opencode-client";
import { useT } from "@/lib/i18n";
import { Server } from "@/stores";

interface QuestionBannerProps {
  request: QuestionRequest;
  server: Server;
}

export function QuestionBanner({ request, server }: QuestionBannerProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();
  // Per-question selections: array of selected labels for each question
  const [selections, setSelections] = useState<string[][]>(
    () => request.questions.map(() => []),
  );
  // Per-question custom text inputs
  const [customInputs, setCustomInputs] = useState<string[]>(
    () => request.questions.map(() => ""),
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

  function updateCustomInput(questionIndex: number, text: string) {
    setCustomInputs((prev) => {
      const updated = [...prev];
      updated[questionIndex] = text;

      return updated;
    });
  }

  function handleSubmit() {
    const answers = request.questions.map((q, i) => {
      const selected = selections[i] ?? [];
      const customText = (customInputs[i] ?? "").trim();
      const allowsCustom = q.custom !== false;

      if (customText && allowsCustom) {
        return [...selected, customText];
      }

      return selected;
    });

    replyMutation.mutate(answers);
  }

  const canSubmit = selections.some((s) => s.length > 0) ||
    customInputs.some((t) => t.trim().length > 0);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className="mx-4 mb-3 overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 28,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2">
          <MessageCircleQuestion size={18} color={theme.colors.secondary} />
          <Text
            className="text-sm font-semibold"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {t("question.title")}
          </Text>
        </View>
        <Pressable
          onPress={() => rejectMutation.mutate()}
          disabled={isPending}
          className="p-1"
          accessibilityLabel={t("a11y.questionClose")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={18} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Questions */}
      {request.questions.map((question, qi) => (
        <View key={qi} className="px-4 pb-3">
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {question.question}
          </Text>

          {/* Options */}
          <View className="gap-1.5">
            {question.options.map((option) => {
              const isSelected = (selections[qi] ?? []).includes(option.label);

              return (
                <Pressable
                  key={option.label}
                  onPress={() => toggleOption(qi, option.label)}
                  disabled={isPending}
                  className="px-3 py-2.5 rounded-[28px]"
                  style={
                    isSelected
                      ? {
                          backgroundColor: theme.colors.secondary,
                        }
                      : {
                          backgroundColor:
                            theme.colors.surfaceContainerLowest,
                          borderWidth: 1,
                          borderColor: theme.colors.outlineVariant,
                        }
                  }
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color: isSelected
                        ? theme.colors.onSecondary
                        : theme.colors.onSurface,
                    }}
                  >
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text
                      className="text-xs mt-0.5"
                      style={{
                        color: isSelected
                          ? theme.colors.onSecondary
                          : theme.colors.onSurfaceVariant,
                      }}
                    >
                      {option.description}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Custom input */}
          {question.custom !== false ? (
            <TextInput
              value={customInputs[qi]}
              onChangeText={(text) => updateCustomInput(qi, text)}
              placeholder={t("question.customPh")}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              editable={!isPending}
              className="mt-2 px-3 py-2 rounded-[28px] text-sm"
              style={{
                backgroundColor: theme.colors.surfaceContainerLowest,
                color: theme.colors.onSurface,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
              }}
            />
          ) : null}
        </View>
      ))}

      {/* Actions */}
      <View className="flex-row justify-end gap-2 px-4 pb-3">
        <Pressable
          onPress={() => rejectMutation.mutate()}
          disabled={isPending}
          className="px-4 py-2 rounded-[28px]"
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          <Text
            className="text-sm font-medium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {t("question.dismiss")}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={isPending || !canSubmit}
          className="px-4 py-2 rounded-lg flex-row items-center gap-2"
          style={{
            backgroundColor:
              canSubmit && !isPending
                ? theme.colors.primary
                : theme.colors.surfaceVariant,
          }}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : null}
          <Text
            className="text-sm font-medium"
            style={{
              color:
                canSubmit && !isPending
                  ? theme.colors.onPrimary
                  : theme.colors.onSurfaceVariant,
            }}
          >
            {t("question.submit")}
          </Text>
        </Pressable>
      </View>
      {(replyMutation.error || rejectMutation.error) && (
        <Text
          className="text-xs px-4 pb-3"
          style={{ color: theme.colors.onSecondaryContainer }}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {t("feedback.replyFailed")}
        </Text>
      )}
    </Animated.View>
  );
}
