import MarkdownIt from "markdown-it";
import React, { useMemo } from "react";
import { Linking, Platform, Text } from "react-native";
import Markdown from "react-native-markdown-display";

import { useAppTheme } from "@/components/Material3ThemeProvider";

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
      marginTop: 4,
      marginBottom: 4,
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

interface MarkdownContentProps {
  content: string;
  isUser: boolean;
}

export function MarkdownContent({ content, isUser }: MarkdownContentProps) {
  const theme = useAppTheme();

  const styles = useMemo(() => {
    if (isUser) {
      const onContainer = theme.colors.onPrimaryContainer;

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

  return (
    <Markdown
      markdownit={markdownItInstance}
      onLinkPress={handleLinkPress}
      style={styles}
      rules={{
        body: (node, children) => (
          <Text key={node.key} style={styles.body} selectable={true}>
            {children}
          </Text>
        ),
        textgroup: (node, children) => (
          <React.Fragment key={node.key}>{children}</React.Fragment>
        ),
        paragraph: (node, children) => (
          <Text key={node.key} style={styles.paragraph}>
            {children}
            {"\n"}
          </Text>
        ),
        heading1: (node, children) => (
          <Text key={node.key} style={styles.heading1}>
            {children}
            {"\n"}
          </Text>
        ),
        heading2: (node, children) => (
          <Text key={node.key} style={styles.heading2}>
            {children}
            {"\n"}
          </Text>
        ),
        heading3: (node, children) => (
          <Text key={node.key} style={styles.heading3}>
            {children}
            {"\n"}
          </Text>
        ),
        heading4: (node, children) => (
          <Text key={node.key} style={styles.heading4}>
            {children}
            {"\n"}
          </Text>
        ),
        heading5: (node, children) => (
          <Text key={node.key} style={styles.heading5}>
            {children}
            {"\n"}
          </Text>
        ),
        heading6: (node, children) => (
          <Text key={node.key} style={styles.heading6}>
            {children}
            {"\n"}
          </Text>
        ),
        blockquote: (node, children) => (
          <Text key={node.key} style={styles.blockquote}>
            {children}
          </Text>
        ),
        code_block: (node) => (
          <Text key={node.key} style={styles.code_block}>
            {node.content}
          </Text>
        ),
        fence: (node) => (
          <Text key={node.key} style={styles.fence}>
            {node.content}
          </Text>
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
            <Text key={node.key} style={styles.list_item}>
              {bullet}
              {children}
              {"\n"}
            </Text>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );
}
