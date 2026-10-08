import * as Clipboard from "expo-clipboard";
import {
  EncodingType,
  cacheDirectory,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import { Check, Copy, Download, Maximize2, X } from "lucide-react-native";
import MarkdownIt from "markdown-it";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { extractTableData, tableToTsv } from "@/lib/markdownTables";
import { useT } from "@/lib/i18n";

const baseFontSize = 15;
const baseLineHeight = 22;
const monoFont = Platform.select({
  ios: "Courier",
  android: "monospace",
  default: "monospace",
});

interface MdPalette {
  text: string;
  subtle: string;
  link: string;
  quoteBg: string;
  quoteBorder: string;
  codeBg: string;
  codeBorder: string;
  codeBorderWidth: number;
  divider: string;
}

function withAlpha(hex: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const value = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");

    return `${hex}${value}`;
  }

  return hex;
}

function buildMarkdownStyles(p: MdPalette) {
  return {
    body: {
      color: p.text,
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
    },
    heading1: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "bold" as const,
      color: p.text,
      marginTop: 8,
      marginBottom: 4,
      flexDirection: "row" as const,
    },
    heading2: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: "bold" as const,
      color: p.text,
      marginTop: 6,
      marginBottom: 4,
      flexDirection: "row" as const,
    },
    heading3: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "600" as const,
      color: p.text,
      marginTop: 4,
      marginBottom: 2,
      flexDirection: "row" as const,
    },
    heading4: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600" as const,
      color: p.text,
      marginTop: 4,
      marginBottom: 2,
      flexDirection: "row" as const,
    },
    heading5: {
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
      fontWeight: "600" as const,
      color: p.text,
      flexDirection: "row" as const,
    },
    heading6: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600" as const,
      color: p.subtle,
      flexDirection: "row" as const,
    },
    paragraph: {
      marginTop: 2,
      marginBottom: 2,
    },
    strong: {
      fontWeight: "bold" as const,
    },
    em: {
      fontStyle: "italic" as const,
    },
    s: {
      textDecorationLine: "line-through" as const,
    },
    link: {
      color: p.link,
      textDecorationLine: "underline" as const,
    },
    blockquote: {
      backgroundColor: p.quoteBg,
      borderColor: p.quoteBorder,
      borderLeftWidth: 3,
      marginLeft: 0,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    code_inline: {
      backgroundColor: p.codeBg,
      color: p.text,
      borderWidth: p.codeBorderWidth,
      borderColor: p.codeBorder,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
      fontFamily: monoFont,
      fontSize: 13,
    },
    code_block: {
      backgroundColor: p.codeBg,
      borderWidth: p.codeBorderWidth,
      borderColor: p.codeBorder,
      borderRadius: 8,
      padding: 10,
      fontFamily: monoFont,
      fontSize: 13,
      color: p.text,
    },
    fence: {
      backgroundColor: p.codeBg,
      borderWidth: p.codeBorderWidth,
      borderColor: p.codeBorder,
      borderRadius: 8,
      padding: 10,
      fontFamily: monoFont,
      fontSize: 13,
      color: p.text,
    },
    table: {
      borderWidth: 1,
      borderColor: p.divider,
      borderRadius: 4,
    },
    thead: {},
    tbody: {},
    th: {
      flex: 1,
      minWidth: 96,
      padding: 6,
      fontWeight: "bold" as const,
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: p.divider,
      flexDirection: "row" as const,
    },
    td: {
      flex: 1,
      minWidth: 96,
      padding: 6,
    },
    hr: {
      backgroundColor: p.divider,
      height: 1,
      marginVertical: 8,
    },
    bullet_list: {},
    ordered_list: {},
    list_item: {},
    bullet_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: p.text,
    },
    bullet_list_content: {
      flex: 1,
    },
    ordered_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: p.text,
    },
    ordered_list_content: {
      flex: 1,
    },
    text: {},
    textgroup: {},
        image: {
          flex: 1,
        },
    hardbreak: {
      width: "100%" as const,
      height: 1,
    },
    softbreak: {},
    blocklink: {
      flex: 1,
      borderColor: p.divider,
      borderBottomWidth: 1,
    },
    pre: {},
    inline: {},
    span: {},
  };
}

const markdownItInstance = MarkdownIt({
  typographer: true,
  linkify: true,
});

function handleLinkPress(url: string) {
  Linking.openURL(url);

  return false;
}

interface FenceNode {
  key: string;
  content: string;
  sourceInfo?: string;
}

function fenceLanguage(node: FenceNode): string {
  return (node.sourceInfo ?? "").trim().split(/\s+/)[0] ?? "";
}

function CodeBlock({
  content,
  language,
  selectable,
  viewStyle,
  textColor,
}: {
  content: string;
  language: string;
  selectable: boolean;
  viewStyle: StyleProp<ViewStyle>;
  textColor: string;
}) {
  const theme = useAppTheme();
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleCopy() {
    void Clipboard.setStringAsync(content);
    setCopied(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  return (
    <View style={viewStyle}>
      <View className="flex-row items-center mb-1">
        <Text
          className="flex-1 text-xs font-mono"
          style={{ color: theme.colors.onSurfaceVariant }}
          numberOfLines={1}
        >
          {language}
        </Text>
        <Pressable
          onPress={handleCopy}
          className="px-2 py-1"
          accessibilityLabel={t("menu.copy")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            className="text-xs"
            style={{ color: copied ? theme.colors.tertiary : theme.colors.primary }}
          >
            {copied ? t("menu.copied") : t("menu.copy")}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator
        persistentScrollbar
        scrollEventThrottle={16}
      >
        <Text
          style={{
            fontFamily: monoFont,
            fontSize: 13,
            color: textColor,
          }}
          selectable={selectable}
        >
          {content}
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * DeepSeek-style table card: header (title + copy/download/fullscreen),
 * horizontally scrollable body without a scrollbar, and a fullscreen
 * viewer. Copy/download share TSV derived from the table AST (pure
 * functions, no render-phase side effects — a counter-based source
 * matcher poisoned React Compiler reconciliation and dropped body rows).
 */

function TableCard({
  node,
  children,
}: {
  node: any;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();
  const { t } = useT();
  const [fullOpen, setFullOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rows = useMemo(() => extractTableData(node), [node]);
  const hasData = rows.some((r) => r.some((c) => c !== ""));

  const handleCopy = async () => {
    const tsv = tableToTsv(rows);

    if (!tsv.trim()) {
      return;
    }

    await Clipboard.setStringAsync(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleDownload = async () => {
    const tsv = tableToTsv(rows);

    if (!tsv.trim() || !cacheDirectory) {
      return;
    }

    const uri = `${cacheDirectory}table-${Date.now()}.tsv`;
    await writeAsStringAsync(uri, tsv, { encoding: EncodingType.UTF8 });
    await Share.share({ url: uri });
  };

  const iconColor = theme.colors.onSurfaceVariant;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        className="flex-row items-center"
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.outlineVariant,
        }}
      >
        <Text
          className="text-sm font-medium flex-1"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {t("table.title")}
        </Text>
        {hasData ? (
          <>
        <Pressable
          onPress={() => {
            void handleCopy();
          }}
          accessibilityLabel={t("menu.copy")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 6 }}
        >
          {copied ? (
            <Check size={20} color={theme.colors.tertiary} />
          ) : (
            <Copy size={20} color={iconColor} />
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            void handleDownload();
          }}
          accessibilityLabel={t("menu.share")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 6 }}
        >
          <Download size={20} color={iconColor} />
        </Pressable>
          </>
        ) : null}
        <Pressable
          onPress={() => setFullOpen(true)}
          accessibilityLabel={t("table.fullscreen")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 6 }}
        >
          <Maximize2 size={20} color={iconColor} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        <View>
          {children}
        </View>
      </ScrollView>
      <Modal
        visible={fullOpen}
        animationType="slide"
        onRequestClose={() => setFullOpen(false)}
      >
        <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          <View
            className="flex-row items-center"
            style={{ paddingVertical: 8, paddingHorizontal: 12 }}
          >
            <Text
              className="text-base font-medium flex-1"
              style={{ color: theme.colors.onSurface }}
            >
              {t("table.title")}
            </Text>
            <Pressable
              onPress={() => setFullOpen(false)}
              accessibilityLabel={t("common.close")}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 6 }}
            >
              <X size={24} color={theme.colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView className="flex-1">
            <ScrollView
              horizontal
              nestedScrollEnabled
              directionalLockEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
            >
              <View>{children}</View>
            </ScrollView>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

interface MarkdownContentProps {
  content: string;
  isUser: boolean;
  selectable?: boolean;
}

export function MarkdownContent({
  content,
  isUser,
  selectable = false,
}: MarkdownContentProps) {
  const theme = useAppTheme();

  // markdown-it has no task-list plugin: rewrite `- [ ]` / `- [x]` into
  // glyphs before parsing so checklist items render instead of raw brackets.
  const prepared = useMemo(
    () =>
      content
        .replace(/^- \[ \]/gm, "☐")
        .replace(/^- \[[xX]\]/gm, "☑"),
    [content],
  );

  const styles = useMemo(() => {
    // User bubbles are tinted (secondaryContainer): tint the markdown
    // palette off the container color so text stays legible on blue.
    // Assistant renders on plain surface: plain onSurface palette.
    if (isUser) {
      const onContainer = theme.colors.onSecondaryContainer;

      return buildMarkdownStyles({
        text: onContainer,
        subtle: onContainer,
        link: onContainer,
        quoteBg: withAlpha(onContainer, 0.12),
        quoteBorder: withAlpha(onContainer, 0.3),
        codeBg: withAlpha(onContainer, 0.12),
        codeBorder: withAlpha(onContainer, 0.2),
        codeBorderWidth: 0,
        divider: withAlpha(onContainer, 0.2),
      });
    }

    return buildMarkdownStyles({
      text: theme.colors.onSurface,
      subtle: theme.colors.onSurfaceVariant,
      link: theme.colors.primary,
      quoteBg: theme.colors.surfaceContainer,
      quoteBorder: theme.colors.outlineVariant,
      codeBg: theme.colors.surfaceContainer,
      codeBorder: theme.colors.outlineVariant,
      codeBorderWidth: 1,
      divider: theme.colors.outlineVariant,
    });
  }, [isUser, theme]);

  // Body is a View (not Text): block children (table/blockquote/code)
  // must never nest a View inside a Text, which mis-measures borders and
  // draws them over the text. Leaf Text nodes carry the font + selectable.
  const leafTextStyle = useMemo(
    () => ({
      color: styles.body.color,
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
    }),
    [styles],
  );

  // View-safe subset of the code style (no font/color text props).
  const codeViewStyle = useMemo(
    () => ({
      backgroundColor: styles.code_block.backgroundColor,
      borderWidth: styles.code_block.borderWidth,
      borderColor: styles.code_block.borderColor,
      borderRadius: 8,
      padding: 10,
    }),
    [styles],
  );

  return (
    <Markdown
      markdownit={markdownItInstance}
      onLinkPress={handleLinkPress}
      style={styles}
      rules={{
        body: (node, children) => (
          <View key={node.key}>{children}</View>
        ),
        textgroup: (node, children) => (
          <React.Fragment key={node.key}>{children}</React.Fragment>
        ),
        paragraph: (node, children) => (
          <Text
            key={node.key}
            style={[leafTextStyle, styles.paragraph]}
            selectable={selectable}
          >
            {children}
          </Text>
        ),
        heading1: (node, children) => (
          <Text key={node.key} style={styles.heading1} selectable={selectable}>
            {children}
            {"\n"}
          </Text>
        ),
        heading2: (node, children) => (
          <Text key={node.key} style={styles.heading2} selectable={selectable}>
            {children}
            {"\n"}
          </Text>
        ),
        heading3: (node, children) => (
          <Text key={node.key} style={styles.heading3} selectable={selectable}>
            {children}
            {"\n"}
          </Text>
        ),
        heading4: (node, children) => (
          <Text key={node.key} style={styles.heading4} selectable={selectable}>
            {children}
            {"\n"}
          </Text>
        ),
        heading5: (node, children) => (
          <Text key={node.key} style={styles.heading5} selectable={selectable}>
            {children}
            {"\n"}
          </Text>
        ),
        heading6: (node, children) => (
          <Text key={node.key} style={styles.heading6} selectable={selectable}>
            {children}
            {"\n"}
          </Text>
        ),
        blockquote: (node, children) => (
          <View key={node.key} style={styles.blockquote}>
            {children}
          </View>
        ),
        code_block: (node) => (
          <CodeBlock
            key={node.key}
            content={node.content}
            language=""
            selectable={selectable}
            viewStyle={codeViewStyle}
            textColor={styles.body.color}
          />
        ),
        fence: (node) => (
          <CodeBlock
            key={node.key}
            content={node.content}
            language={fenceLanguage(node as FenceNode)}
            selectable={selectable}
            viewStyle={codeViewStyle}
            textColor={styles.body.color}
          />
        ),
        table: (node, children) => (
          <TableCard key={node.key} node={node}>
            {children}
          </TableCard>
        ),
        bullet_list: (node, children) => (
          <React.Fragment key={node.key}>{children}</React.Fragment>
        ),
        ordered_list: (node, children) => (
          <React.Fragment key={node.key}>{children}</React.Fragment>
        ),
        list_item: (node, children, parent) => {
          const isOrdered = parent.some((el) => el.type === "ordered_list");
          const bullet = isOrdered ? `${node.index + 1}. ` : "• ";

          return (
            <Text
              key={node.key}
              style={[leafTextStyle, styles.list_item]}
              selectable={selectable}
            >
              {bullet}
              {children}
              {"\n"}
            </Text>
          );
        },
        image: (node) => {
          const src = node.attributes?.src;

          if (typeof src !== "string" || !src) {
            return null;
          }

          return (
            <Image
              key={node.key}
              source={{ uri: src }}
              style={{ width: "100%", height: 200 }}
              resizeMode="contain"
            />
          );
        },
      }}
    >
      {prepared}
    </Markdown>
  );
}
