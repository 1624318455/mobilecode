import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type {
  FormAnswer,
  FormField,
  FormInfo,
  FormValue,
} from "@opencode/client";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { createV2Client } from "@/lib/v2client";
import { useT } from "@/lib/i18n";
import { Server } from "@/stores";

interface FormBannerProps {
  form: FormInfo;
  server: Server;
}

function fieldActive(
  field: FormField,
  answers: Record<string, FormValue | undefined>,
): boolean {
  if (!("when" in field) || !field.when || field.when.length === 0) {
    return true;
  }

  return field.when.every((condition) => {
    const current = answers[condition.key];

    if (current === undefined) {
      return false;
    }

    const selected = Array.isArray(current) ? current : [current];
    const hit = selected.some((value) => value === condition.value);

    return condition.op === "eq" ? hit : !hit;
  });
}

function defaultOf(field: FormField): FormValue | undefined {
  if (field.type === "external") {
    return undefined;
  }

  if (field.default !== undefined) {
    if (field.type === "multiselect") {
      return [...(field.default as string[])];
    }

    return field.default as FormValue;
  }

  return undefined;
}

function answered(field: FormField, value: FormValue | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  return value.length > 0;
}

export function FormBanner({ form, server }: FormBannerProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, FormValue | undefined>>(
    () => {
      const initial: Record<string, FormValue | undefined> = {};

      for (const field of form.fields) {
        const value = defaultOf(field);

        if (value !== undefined) {
          initial[field.key] = value;
        }
      }

      return initial;
    },
  );
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const fields = useMemo(
    () =>
      form.fields.filter(
        (field) => field.type !== "external" && !(field as { hidden?: boolean }).hidden && fieldActive(field, answers),
      ),
    [form.fields, answers],
  );

  const externalFields = useMemo(
    () => form.fields.filter((field) => field.type === "external"),
    [form.fields],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["server", server.url, "session", form.sessionID, "forms"],
    });
    queryClient.invalidateQueries({
      queryKey: ["server", server.url, "session", form.sessionID, "messages"],
    });
  };

  const replyMutation = useMutation({
    mutationFn: async (answer: FormAnswer) => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.form.reply({
        sessionID: form.sessionID,
        formID: form.id,
        answer,
      });
    },
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.form.cancel({
        sessionID: form.sessionID,
        formID: form.id,
      });
    },
    onSuccess: invalidate,
  });

  const isPending = replyMutation.isPending || cancelMutation.isPending;

  function setAnswer(key: string, value: FormValue | undefined) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const answer: FormAnswer = {};

    for (const field of fields) {
      const value = answers[field.key];

      if (value !== undefined) {
        answer[field.key] = value;
      }
    }

    replyMutation.mutate(answer);
  }

  const canSubmit =
    fields.length > 0 &&
    fields.every((field) => {
      if ("required" in field && field.required) {
        return answered(field, answers[field.key]);
      }

      return true;
    });

  function renderField(field: FormField) {
    const value = answers[field.key];
    const title = ("title" in field && field.title) || field.key;
    const description = ("description" in field && field.description) || undefined;

    if (field.type === "boolean") {
      return (
        <View key={field.key} className="px-4 pb-3">
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {title}
          </Text>
          <View className="flex-row gap-2">
            {[true, false].map((option) => {
              const selected = value === option;

              return (
                <Pressable
                  key={String(option)}
                  onPress={() => setAnswer(field.key, option)}
                  disabled={isPending}
                  className="flex-1 items-center px-3 py-2 rounded-[28px]"
                  style={{
                    backgroundColor: selected
                      ? theme.colors.secondary
                      : theme.colors.surfaceContainerLowest,
                    borderWidth: selected ? 0 : 1,
                    borderColor: theme.colors.outlineVariant,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color: selected
                        ? theme.colors.onSecondary
                        : theme.colors.onSurface,
                    }}
                  >
                    {option ? t("form.yes") : t("form.no")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {description ? (
            <Text
              className="text-xs mt-1"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {description}
            </Text>
          ) : null}
        </View>
      );
    }

    if (field.type === "multiselect") {
      const selected = Array.isArray(value) ? value : [];

      function toggle(entry: string) {
        if (selected.includes(entry)) {
          setAnswer(
            field.key,
            selected.filter((item) => item !== entry),
          );
        } else {
          setAnswer(field.key, [...selected, entry]);
        }
      }

      return (
        <View key={field.key} className="px-4 pb-3">
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {title}
          </Text>
          <View className="gap-1.5">
            {field.options.map((option) => {
              const isSelected = selected.includes(option.value);

              return (
                <Pressable
                  key={option.value}
                  onPress={() => toggle(option.value)}
                  disabled={isPending}
                  className="px-3 py-2.5 rounded-[28px]"
                  style={
                    isSelected
                      ? { backgroundColor: theme.colors.secondary }
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
          {field.custom !== false ? (
            <TextInput
              value={customInputs[field.key] ?? ""}
              onChangeText={(text) => {
                setCustomInputs((prev) => ({ ...prev, [field.key]: text }));

                const trimmed = text.trim();
                const base = selected.filter(
                  (item) =>
                    !field.options.some((option) => option.value === item),
                );

                setAnswer(
                  field.key,
                  trimmed ? [...base, trimmed] : base.length > 0 ? base : undefined,
                );
              }}
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
      );
    }

    if (field.type === "string" && field.options && field.options.length > 0) {
      const allowsCustom = field.custom !== false;

      return (
        <View key={field.key} className="px-4 pb-3">
          <Text
            className="text-sm font-medium mb-2"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {title}
          </Text>
          <View className="gap-1.5">
            {field.options.map((option) => {
              const isSelected = value === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setAnswer(field.key, option.value);
                    setCustomInputs((prev) => ({ ...prev, [field.key]: "" }));
                  }}
                  disabled={isPending}
                  className="px-3 py-2.5 rounded-[28px]"
                  style={
                    isSelected
                      ? { backgroundColor: theme.colors.secondary }
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
          {allowsCustom ? (
            <TextInput
              value={customInputs[field.key] ?? ""}
              onChangeText={(text) => {
                setCustomInputs((prev) => ({ ...prev, [field.key]: text }));
                setAnswer(field.key, text.trim() ? text.trim() : undefined);
              }}
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
      );
    }

    // Plain string / number / integer: free text input.
    const numeric = field.type === "number" || field.type === "integer";

    return (
      <View key={field.key} className="px-4 pb-3">
        <Text
          className="text-sm font-medium mb-2"
          style={{ color: theme.colors.onSecondaryContainer }}
        >
          {title}
        </Text>
        <TextInput
          value={
            typeof value === "string"
              ? value
              : typeof value === "number"
                ? String(value)
                : ""
          }
          onChangeText={(text) => {
            if (!numeric) {
              setAnswer(field.key, text);
              return;
            }

            if (!text.trim()) {
              setAnswer(field.key, undefined);
              return;
            }

            const parsed =
              field.type === "integer"
                ? Number.parseInt(text, 10)
                : Number.parseFloat(text);

            setAnswer(field.key, Number.isFinite(parsed) ? parsed : undefined);
          }}
          placeholder={("placeholder" in field && field.placeholder) || undefined}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          editable={!isPending}
          keyboardType={numeric ? "numeric" : "default"}
          className="px-3 py-2 rounded-[28px] text-sm"
          style={{
            backgroundColor: theme.colors.surfaceContainerLowest,
            color: theme.colors.onSurface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
          }}
        />
        {description ? (
          <Text
            className="text-xs mt-1"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {description}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className="mx-4 mb-3 overflow-hidden"
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
      }}
    >
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2">
          <MessageCircleQuestion size={18} color={theme.colors.secondary} />
          <Text
            className="text-sm font-semibold"
            style={{ color: theme.colors.onSecondaryContainer }}
          >
            {form.title}
          </Text>
        </View>
        <Pressable
          onPress={() => cancelMutation.mutate()}
          disabled={isPending}
          className="p-1"
          accessibilityLabel={t("a11y.questionClose")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={18} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {fields.map(renderField)}

      {externalFields.length > 0 ? (
        <View className="px-4 pb-3 gap-1.5">
          {externalFields.map((field) => (
            <Pressable
              key={field.key}
              onPress={() => {
                void Linking.openURL(field.url);
              }}
              className="px-3 py-2.5 rounded-[28px]"
              style={{
                backgroundColor: theme.colors.surfaceContainerLowest,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: theme.colors.primary }}
              >
                {("title" in field && field.title) || field.key}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="flex-row justify-end gap-2 px-4 pb-3">
        <Pressable
          onPress={() => cancelMutation.mutate()}
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
      {(replyMutation.error || cancelMutation.error) && (
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
