import { File, Folder } from "lucide-react-native";
import { FlatList, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";

export interface FileMentionItem {
  path: string;
  isDirectory: boolean;
}

interface FileMentionPopoverProps {
  items: FileMentionItem[];
  activeIndex: number;
  onSelect: (item: FileMentionItem) => void;
  isLoading: boolean;
  query: string;
}

function getFilename(path: string) {
  const parts = path.split("/");

  return parts[parts.length - 1] || path;
}

function getDirectory(path: string) {
  const idx = path.lastIndexOf("/");
  if (idx < 0) {
    return "";
  }

  return path.slice(0, idx + 1);
}

export function FileMentionPopover({
  items,
  activeIndex,
  onSelect,
  isLoading,
  query,
}: FileMentionPopoverProps) {
  const theme = useAppTheme();
  const { t } = useT();

  if (items.length === 0) {
    return (
      <View
        className="rounded-[28px] p-3"
        style={{ backgroundColor: theme.colors.surfaceContainerHigh }}
      >
        <Text
          className="text-sm"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {isLoading ? t("popover.searching") : t("popover.noFiles")}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="rounded-[28px] overflow-hidden max-h-48"
      style={{
        backgroundColor: theme.colors.surfaceContainerHigh,
        elevation: 3,
      }}
    >
      <FlatList
        data={items.slice(0, 10)}
        keyExtractor={(item) => item.path}
        keyboardShouldPersistTaps="always"
        renderItem={({ item, index }) => {
          const isActive = index === activeIndex;
          const isDir = item.isDirectory;
          const directory = isDir ? item.path : getDirectory(item.path);
          const filename = isDir ? "" : getFilename(item.path);

          return (
            <Pressable
              onPress={() => onSelect(item)}
              className="flex-row items-center gap-2 px-3 py-2"
              style={
                isActive
                  ? { backgroundColor: theme.colors.secondaryContainer }
                  : undefined
              }
            >
              {isDir ? (
                <Folder size={16} color={theme.colors.onSurfaceVariant} />
              ) : (
                <File size={16} color={theme.colors.onSurfaceVariant} />
              )}
              <View className="flex-row flex-1 min-w-0">
                <Text
                  className="text-sm"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  numberOfLines={1}
                >
                  {directory}
                </Text>
                {!isDir && (
                  <Text
                    className="text-sm"
                    style={{ color: theme.colors.onSurface }}
                    numberOfLines={1}
                  >
                    {filename}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
