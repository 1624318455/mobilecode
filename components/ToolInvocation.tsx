import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileCode,
  FileText,
  HelpCircle,
  ListTree,
  MessageCircleQuestion,
  Search,
  Terminal,
} from "lucide-react-native";
import { cloneElement, isValidElement, memo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ToolPart } from "@opencode-ai/sdk/v2";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { StatusBadge } from "./StatusBadge";

type ToolStatus = "pending" | "running" | "completed" | "error";

interface ToolInvocationProps {
  part: ToolPart;
}

function getToolStatus(part: ToolPart): ToolStatus {
  return part.state.status as ToolStatus;
}

function getInput(part: ToolPart): Record<string, unknown> {
  return (part.state.input ?? {}) as Record<string, unknown>;
}

function getOutput(part: ToolPart): string | undefined {
  if (part.state.status === "completed") {
    return part.state.output;
  }

  return undefined;
}

function getMetadata(part: ToolPart): Record<string, unknown> {
  if (part.state.status === "running" || part.state.status === "completed") {
    return (part.state.metadata ?? {}) as Record<string, unknown>;
  }

  return {};
}

function getError(part: ToolPart): string | undefined {
  if (part.state.status === "error") {
    return part.state.error;
  }

  return undefined;
}

function getFilename(path: string | undefined): string {
  if (!path) {
    return "";
  }

  const parts = path.split("/");

  return parts[parts.length - 1] || path;
}

function getDirectory(path: string | undefined): string {
  if (!path) {
    return "";
  }

  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "";
  }

  return path.substring(0, lastSlash);
}

// -- Collapsible wrapper shared by all tool renderers --

function ToolCard({
  icon,
  title,
  subtitle,
  args,
  status,
  error,
  hideDetails,
  defaultExpanded = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  args?: string[];
  status: ToolStatus;
  error?: string;
  hideDetails?: boolean;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const theme = useAppTheme();
  const pending = status === "pending" || status === "running";
  const hasDetails = !hideDetails && children;
  const tintedIcon = isValidElement<{ color?: string }>(icon)
    ? cloneElement(icon, { color: theme.colors.onSurfaceVariant })
    : icon;

  return (
    <View
      className="mt-2 overflow-hidden"
      style={{
        backgroundColor: theme.colors.surfaceContainer,
        borderRadius: 28,
      }}
    >
      <Pressable
        onPress={() => {
          if (hasDetails && !pending) {
            setExpanded(!expanded);
          }
        }}
        className="p-3 flex-row items-center justify-between gap-2"
      >
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          {tintedIcon}
          <Text
            className="text-sm font-semibold"
            style={{
              color: pending
                ? theme.colors.tertiary
                : theme.colors.onSurface,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!pending && subtitle ? (
            <Text
              className="text-sm flex-shrink"
              style={{ color: theme.colors.onSurfaceVariant }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
          {!pending && args
            ? args.map((arg, i) => (
                <Text
                  key={i}
                  className="text-xs font-mono"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  numberOfLines={1}
                >
                  {arg}
                </Text>
              ))
            : null}
          {pending ? (
            <StatusBadge status="busy" size="sm" />
          ) : status === "error" ? (
            <StatusBadge status="error" size="sm" />
          ) : null}
        </View>
        {hasDetails && !pending ? (
          expanded ? (
            <ChevronUp size={14} color={theme.colors.onSurfaceVariant} />
          ) : (
            <ChevronDown size={14} color={theme.colors.onSurfaceVariant} />
          )
        ) : null}
      </Pressable>

      {error ? (
        <View
          className="px-3 pb-3"
          style={{ backgroundColor: theme.colors.errorContainer }}
        >
          <Text
            className="text-xs mt-2"
            style={{ color: theme.colors.onErrorContainer }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      {expanded && hasDetails ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.outlineVariant,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

// -- Specialized tool renderers --

function ReadToolDisplay({ part }: { part: ToolPart }) {
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const filePath = input.filePath as string | undefined;
  const offset = input.offset as number | undefined;
  const limit = input.limit as number | undefined;

  const args: string[] = [];
  if (offset !== undefined) {
    args.push(t("tools.offset", { v: offset }));
  }
  if (limit !== undefined) {
    args.push(t("tools.limit", { v: limit }));
  }

  return (
    <ToolCard
      icon={<Eye size={14} />}
      title={t("tools.read")}
      subtitle={getFilename(filePath)}
      args={args}
      status={status}
      error={error}
      hideDetails
    />
  );
}

function WriteToolDisplay({ part }: { part: ToolPart }) {
  const theme = useAppTheme();
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const filePath = input.filePath as string | undefined;
  const directory = getDirectory(filePath);

  return (
    <ToolCard
      icon={<FileText size={14} />}
      title={t("tools.write")}
      subtitle={getFilename(filePath)}
      status={status}
      error={error}
      hideDetails
    >
      {directory ? (
        <View className="px-3 py-1">
          <Text
            className="text-xs"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {directory}
          </Text>
        </View>
      ) : null}
    </ToolCard>
  );
}

function EditToolDisplay({ part }: { part: ToolPart }) {
  const theme = useAppTheme();
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const filePath = input.filePath as string | undefined;
  const directory = getDirectory(filePath);

  return (
    <ToolCard
      icon={<FileCode size={14} />}
      title={t("tools.edit")}
      subtitle={getFilename(filePath)}
      status={status}
      error={error}
      hideDetails
    >
      {directory ? (
        <View className="px-3 py-1">
          <Text
            className="text-xs"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {directory}
          </Text>
        </View>
      ) : null}
    </ToolCard>
  );
}

function BashToolDisplay({ part }: { part: ToolPart }) {
  const theme = useAppTheme();
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const output = getOutput(part);
  const command = input.command as string | undefined;
  const description = input.description as string | undefined;

  const shellOutput = (() => {
    if (!command && !output) {
      return undefined;
    }

    const cmd = command ?? "";
    const out = output ?? "";

    return `$ ${cmd}${out ? "\n\n" + out : ""}`;
  })();

  return (
    <ToolCard
      icon={<Terminal size={14} />}
      title={t("tools.shell")}
      subtitle={description}
      status={status}
      error={error}
    >
      {shellOutput ? (
        <ScrollView
          horizontal={false}
          className="max-h-48"
          contentContainerClassName="p-3"
        >
          <Text
            className="text-xs font-mono"
            style={{ color: theme.colors.onSurface }}
          >
            {shellOutput}
          </Text>
        </ScrollView>
      ) : null}
    </ToolCard>
  );
}

function GlobToolDisplay({ part }: { part: ToolPart }) {
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const pattern = input.pattern as string | undefined;
  const path = input.path as string | undefined;

  const args: string[] = [];
  if (pattern) {
    args.push(t("tools.pattern", { v: pattern }));
  }

  return (
    <ToolCard
      icon={<Search size={14} />}
      title={t("tools.glob")}
      subtitle={path || "/"}
      args={args}
      status={status}
      error={error}
      hideDetails
    />
  );
}

function GrepToolDisplay({ part }: { part: ToolPart }) {
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const pattern = input.pattern as string | undefined;
  const include = input.include as string | undefined;
  const path = input.path as string | undefined;

  const args: string[] = [];
  if (pattern) {
    args.push(t("tools.pattern", { v: pattern }));
  }
  if (include) {
    args.push(t("tools.include", { v: include }));
  }

  return (
    <ToolCard
      icon={<Search size={14} />}
      title={t("tools.grep")}
      subtitle={path || "/"}
      args={args}
      status={status}
      error={error}
      hideDetails
    />
  );
}

function TaskToolDisplay({ part }: { part: ToolPart }) {
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const subagentType = input.subagent_type as string | undefined;
  const description = input.description as string | undefined;

  return (
    <ToolCard
      icon={<ListTree size={14} />}
      title={t("tools.agent", { n: subagentType || t("tools.task") })}
      subtitle={description}
      status={status}
      error={error}
      hideDetails
    />
  );
}

function QuestionToolDisplay({ part }: { part: ToolPart }) {
  const theme = useAppTheme();
  const { t } = useT();
  const status = getToolStatus(part);
  const error = getError(part);
  const input = getInput(part);
  const metadata = getMetadata(part);

  const questions = (input.questions ?? []) as {
    question: string;
    header?: string;
    options?: { label: string; description?: string }[];
  }[];
  const answers = (metadata.answers ?? []) as string[][];
  const completed = answers.length > 0;

  const subtitle = (() => {
    const count = questions.length;
    if (count === 0) {
      return "";
    }
    if (completed) {
      return t("tools.answered", { n: count });
    }

    return t("tools.questionsCount", { n: count, s: count > 1 ? "s" : "" });
  })();

  return (
    <ToolCard
      icon={<MessageCircleQuestion size={14} />}
      title={t("tools.questions")}
      subtitle={subtitle}
      status={status}
      error={error}
      defaultExpanded={completed}
    >
      {completed ? (
        <View className="px-3 py-2 gap-2">
          {questions.map((q, i) => {
            const answer = answers[i] ?? [];

            return (
              <View key={i} className="gap-1">
                <Text
                  className="text-xs font-semibold"
                  style={{ color: theme.colors.onSurface }}
                >
                  {q.question}
                </Text>
                <Text
                  className="text-xs ml-2"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {answer.join(", ") || t("tools.noAnswer")}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </ToolCard>
  );
}

function WebFetchToolDisplay({ part }: { part: ToolPart }) {
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const url = input.url as string | undefined;

  return (
    <ToolCard
      icon={<Search size={14} />}
      title={t("tools.webfetch")}
      subtitle={url}
      status={status}
      error={error}
      hideDetails
    />
  );
}

function SkillToolDisplay({ part }: { part: ToolPart }) {
  const { t } = useT();
  const input = getInput(part);
  const status = getToolStatus(part);
  const error = getError(part);
  const name = input.name as string | undefined;

  return (
    <ToolCard
      icon={<HelpCircle size={14} />}
      title={name || t("tools.skill")}
      status={status}
      error={error}
      hideDetails
    />
  );
}

function TodoWriteToolDisplay({ part }: { part: ToolPart }) {
  const theme = useAppTheme();
  const { t } = useT();
  const input = getInput(part);
  const metadata = getMetadata(part);
  const status = getToolStatus(part);
  const error = getError(part);

  const todos = (() => {
    const meta = metadata.todos;
    if (Array.isArray(meta)) {
      return meta as {
        content: string;
        status: string;
        priority?: string;
      }[];
    }

    const inputTodos = input.todos;
    if (Array.isArray(inputTodos)) {
      return inputTodos as {
        content: string;
        status: string;
        priority?: string;
      }[];
    }

    return [];
  })();

  const completedCount = todos.filter((t) => t.status === "completed").length;
  const subtitle =
    todos.length > 0 ? `${completedCount}/${todos.length}` : undefined;

  return (
    <ToolCard
      icon={<ListTree size={14} />}
      title={t("tools.todos")}
      subtitle={subtitle}
      status={status}
      error={error}
      defaultExpanded={true}
    >
      {todos.length > 0 ? (
        <View className="px-3 py-2 gap-1">
          {todos.map((todo, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <Text
                className="text-xs"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {todo.status === "completed"
                  ? "\u2611"
                  : todo.status === "in_progress"
                    ? "\u25B6"
                    : "\u2610"}
              </Text>
              <Text
                className={`text-xs flex-1 ${todo.status === "completed" ? "line-through" : ""}`}
                style={{
                  color:
                    todo.status === "completed"
                      ? theme.colors.onSurfaceVariant
                      : theme.colors.onSurface,
                }}
                numberOfLines={2}
              >
                {todo.content}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ToolCard>
  );
}

// -- Default fallback for unknown tools --

function DefaultToolDisplay({ part }: { part: ToolPart }) {
  const theme = useAppTheme();
  const { t } = useT();
  const input = getInput(part);
  const output = getOutput(part);
  const status = getToolStatus(part);
  const error = getError(part);

  return (
    <ToolCard
      icon={<FileText size={14} />}
      title={part.tool || t("tools.unknown")}
      status={status}
      error={error}
    >
      <View className="px-3 pb-3">
        {Object.keys(input).length > 0 ? (
          <View className="mt-2">
            <Text
              className="text-xs font-semibold mb-1"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("tools.inputLabel")}
            </Text>
            <View
              className="rounded p-2"
              style={{ backgroundColor: theme.colors.surfaceContainerLowest }}
            >
              <Text
                className="text-xs font-mono"
                style={{ color: theme.colors.onSurface }}
              >
                {JSON.stringify(input, null, 2)}
              </Text>
            </View>
          </View>
        ) : null}

        {output !== undefined ? (
          <View className="mt-2">
            <Text
              className="text-xs font-semibold mb-1"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t("tools.outputLabel")}
            </Text>
            <View
              className="rounded p-2"
              style={{ backgroundColor: theme.colors.surfaceContainerLowest }}
            >
              <ScrollView horizontal={false} className="max-h-48">
                <Text
                  className="text-xs font-mono"
                  style={{ color: theme.colors.onSurface }}
                >
                  {output}
                </Text>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </View>
    </ToolCard>
  );
}

// -- Tool renderers registry --

const TOOL_RENDERERS: Record<
  string,
  React.ComponentType<{ part: ToolPart }>
> = {
  mcp_read: ReadToolDisplay,
  mcp_write: WriteToolDisplay,
  mcp_edit: EditToolDisplay,
  mcp_bash: BashToolDisplay,
  mcp_glob: GlobToolDisplay,
  mcp_grep: GrepToolDisplay,
  mcp_task: TaskToolDisplay,
  mcp_question: QuestionToolDisplay,
  mcp_webfetch: WebFetchToolDisplay,
  mcp_skill: SkillToolDisplay,
  mcp_todowrite: TodoWriteToolDisplay,
  // Also register without mcp_ prefix for direct tool names
  read: ReadToolDisplay,
  write: WriteToolDisplay,
  edit: EditToolDisplay,
  bash: BashToolDisplay,
  glob: GlobToolDisplay,
  grep: GrepToolDisplay,
  task: TaskToolDisplay,
  question: QuestionToolDisplay,
  webfetch: WebFetchToolDisplay,
  skill: SkillToolDisplay,
  todowrite: TodoWriteToolDisplay,
  todoread: TodoWriteToolDisplay,
};

export const ToolInvocation = memo(function ToolInvocation({
  part,
}: ToolInvocationProps) {
  const Renderer = TOOL_RENDERERS[part.tool];

  if (Renderer) {
    return <Renderer part={part} />;
  }

  return <DefaultToolDisplay part={part} />;
});
