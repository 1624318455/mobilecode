import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SegmentedButtons } from "react-native-paper";

import {
  FileMentionItem,
  FileMentionPopover,
} from "@/components/FileMentionPopover";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { toServerPath, useFileList } from "@/hooks/useFileList";
import { useFileSearch } from "@/hooks/useFileSearch";
import { basenameOf } from "@/hooks/useAllSessions";
import { useT } from "@/lib/i18n";
import { Server } from "@/stores";

interface AttachSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: FileMentionItem) => void;
  server: Server;
  projectPath: string | undefined;
}

type AttachTab = "search" | "browse";

function rootOf(projectPath: string): string {
  return toServerPath(projectPath).replace(/\/+$/, "");
}

// Sheet is 60% of screen height; reserve a fixed budget for the header
// block (handle/title/tabs/search-or-crumbs/paddings) so the list gets a
// deterministic floor regardless of flex propagation.
// NOTE: useWindowDimensions (reactive) instead of Dimensions.get: with the
// keyboard open the window shrinks and a one-shot read would compute a
// small sheet/list. The browse tab dismisses the keyboard anyway.
function listMinHeight(windowHeight: number): number {
  const sheet = Math.round(windowHeight * 0.6);

  return Math.max(320, sheet - 340);
}

// Relative segments from the project root to browsePath (both normalized).
function segmentsOf(root: string, browsePath: string): string[] {
  const rel = browsePath.startsWith(root)
    ? browsePath.slice(root.length).replace(/^\/+/, "")
    : "";

  if (!rel) {
    return [];
  }

  return rel.split("/").filter(Boolean);
}

export function AttachSheet({
  visible,
  onClose,
  onSelect,
  server,
  projectPath,
}: AttachSheetProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const { height: windowHeight } = useWindowDimensions();
  const [searchText, setSearchText] = useState("");
  const [tab, setTab] = useState<AttachTab>("search");
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const sheetHeight = Math.round(windowHeight * 0.6);
  const listFloor = listMinHeight(windowHeight);

  function handleTabChange(v: string) {
    const next = v as AttachTab;
    setTab(next);

    if (next === "browse") {
      // Browse needs no keyboard: dismiss it so the window (and the 60%
      // sheet derived from it) stays full height.
      Keyboard.dismiss();
    }
  }

  useEffect(() => {
    if (visible) {
      setSearchText("");
      setTab("search");
      setBrowsePath(projectPath ? rootOf(projectPath) : undefined);
    }
  }, [visible, projectPath]);

  const { data: searchResults = [], isLoading } = useFileSearch(
    server,
    projectPath,
    searchText,
  );

  const fileItems: FileMentionItem[] = useMemo(() => {
    return searchResults.map((path) => ({
      path,
      isDirectory: path.endsWith("/"),
    }));
  }, [searchResults]);

  const { data: nodes = [], isLoading: isBrowsing } = useFileList(
    server,
    projectPath,
    tab === "browse" ? browsePath : undefined,
  );

  const browseItems: FileMentionItem[] = useMemo(() => {
    const root = projectPath ? rootOf(projectPath) : "";

    return nodes.map((node) => {
      const absolute = toServerPath(node.absolute);
      const rel = absolute.startsWith(root)
        ? absolute.slice(root.length).replace(/^\/+/, "")
        : node.name;

      return {
        path: rel,
        isDirectory: node.type === "directory",
        absolute,
      };
    });
  }, [nodes, projectPath]);

  const crumbs = useMemo(() => {
    if (!projectPath || !browsePath) {
      return { root: "", segments: [] as string[] };
    }

    const root = rootOf(projectPath);

    return { root, segments: segmentsOf(root, browsePath) };
  }, [projectPath, browsePath]);

  function crumbPath(index: number): string {
    if (index < 0) {
      return crumbs.root;
    }

    return `${crumbs.root}/${crumbs.segments.slice(0, index + 1).join("/")}`;
  }

  function handleBrowseSelect(item: FileMentionItem) {
    if (item.isDirectory && item.absolute) {
      setBrowsePath(item.absolute);

      return;
    }

    onSelect(item);
  }

  const canBrowse = !!projectPath;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={onClose}
          accessibilityLabel={t("common.cancel")}
          accessibilityRole="button"
        />
        <View
          className="rounded-t-[28px] p-4 pb-8"
          style={{
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            // Fixed 60% of screen height: stable across directories with
            // few or many files, no jumping on navigation.
            height: sheetHeight,
          }}
        >
          <View
            className="self-center rounded-full mb-3"
            style={{
              width: 40,
              height: 4,
              backgroundColor: theme.colors.outlineVariant,
            }}
          />
          <Text
            className="text-base font-semibold mb-3"
            style={{ color: theme.colors.onSurface }}
          >
            {t("input.attachTitle")}
          </Text>
          {canBrowse ? (
            <SegmentedButtons
              value={tab}
              onValueChange={handleTabChange}
              buttons={[
                { value: "search", label: t("input.attachSearchTab") },
                { value: "browse", label: t("input.attachBrowseTab") },
              ]}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {tab === "search" || !canBrowse ? (
            <>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder={t("input.attachSearch")}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                className="px-4 py-2 text-base mb-3"
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 20,
                  color: theme.colors.onSurface,
                }}
            autoFocus={tab === "search"}
          />
              <View className="flex-1">
                <FileMentionPopover
                  items={fileItems}
                  activeIndex={0}
                  onSelect={onSelect}
                  isLoading={isLoading}
                  query={searchText}
                  maxHeight={null}
                  minHeight={listFloor}
                  maxItems={50}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-3"
              >
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => setBrowsePath(crumbPath(-1))}
                    className="px-3 py-1.5"
                    style={{
                      backgroundColor: theme.colors.secondaryContainer,
                      borderRadius: 999,
                    }}
                    accessibilityRole="button"
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: theme.colors.onSecondaryContainer }}
                    >
                      {projectPath ? basenameOf(projectPath) : ""}
                    </Text>
                  </Pressable>
                  {crumbs.segments.map((seg, i) => (
                    <View key={i} className="flex-row items-center">
                      <Text
                        className="mx-1 text-xs"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        /
                      </Text>
                      <Pressable
                        onPress={() => setBrowsePath(crumbPath(i))}
                        className="px-3 py-1.5"
                        style={{
                          backgroundColor: theme.colors.surfaceContainerHighest,
                          borderRadius: 999,
                        }}
                        accessibilityRole="button"
                      >
                        <Text
                          className="text-xs"
                          style={{ color: theme.colors.onSurface }}
                        >
                          {seg}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View className="flex-1">
                <FileMentionPopover
                  items={browseItems}
                  activeIndex={0}
                  onSelect={handleBrowseSelect}
                  isLoading={isBrowsing}
                  query=""
                  maxHeight={null}
                  minHeight={listFloor}
                  maxItems={50}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
