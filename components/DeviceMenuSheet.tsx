import { router } from "expo-router";
import { Link2, Pencil, RefreshCw, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { SlideInDown } from "react-native-reanimated";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { useT } from "@/lib/i18n";
import { DeviceRecord } from "@/lib/protocol";
import { clearSecureForServer } from "@/lib/secure";
import { useAppStore } from "@/stores";

interface DeviceMenuSheetProps {
  visible: boolean;
  record: DeviceRecord;
  onCheck: () => void;
  onClose: () => void;
}

function SheetRow({
  icon,
  label,
  labelColor,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  labelColor?: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-2 py-3 active:opacity-70"
      accessibilityRole="menuitem"
      accessibilityLabel={label}
    >
      {icon}
      <Text
        className="text-base"
        style={{ color: labelColor ?? theme.colors.onSurface }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function DeviceMenuSheet({
  visible,
  record,
  onCheck,
  onClose,
}: DeviceMenuSheetProps) {
  const theme = useAppTheme();
  const { t } = useT();
  const updateServer = useAppStore((s) => s.updateServer);
  const removeServer = useAppStore((s) => s.removeServer);
  const server = useAppStore((s) => s.servers.find((x) => x.id === record.id));
  // The parent mounts this sheet only while it is open, so opening always
  // starts from a fresh state seeded with the latest device name.
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(record.customName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSaveName = () => {
    const next = name.trim();

    if (!next) {
      setNameError(t("device.renameEmpty"));

      return;
    }

    updateServer(record.id, { name: next });
    setRenaming(false);
    setNameError(null);
  };

  const handleConfirmDelete = () => {
    if (server?.deviceTokenRef) {
      clearSecureForServer(server.deviceTokenRef);
    }

    removeServer(record.id);
    onClose();
  };

  const iconColor = theme.colors.onSurfaceVariant;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: theme.colors.scrim, opacity: 0.45 }}
          onPress={onClose}
          accessibilityLabel={t("common.cancel")}
          accessibilityRole="button"
        />
        <Animated.View
          entering={SlideInDown.duration(220)}
          className="rounded-t-[28px] px-5 pt-3 pb-6"
          style={{ backgroundColor: theme.colors.elevation.level2 }}
          accessibilityRole="menu"
        >
          <View className="items-center pb-2">
            <View
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: theme.colors.outlineVariant }}
            />
          </View>
          <Text
            className="text-lg font-semibold"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {record.customName}
          </Text>
          <Text
            className="text-sm mt-0.5"
            style={{ color: theme.colors.onSurfaceVariant }}
            numberOfLines={1}
          >
            {record.mode === "remote" ? t("device.remote") : t("device.lan")} •{" "}
            {record.origin}
          </Text>
          {confirmingDelete ? (
            <View className="pt-3">
              <Text
                className="text-base font-semibold"
                style={{ color: theme.colors.onSurface }}
              >
                {t("device.delTitle")}
              </Text>
              <Text
                className="text-sm mt-1"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("device.delMsg")}
              </Text>
              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={handleConfirmDelete}
                  className="flex-1 rounded-[28px] py-3 items-center active:opacity-80"
                  style={{ backgroundColor: theme.colors.error }}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.delete")}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: theme.colors.onError }}
                  >
                    {t("common.delete")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirmingDelete(false);
                  }}
                  className="flex-1 rounded-[28px] py-3 items-center active:opacity-80"
                  style={{ backgroundColor: theme.colors.surfaceVariant }}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("common.cancel")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : renaming ? (
            <View className="pt-3">
              <Text
                className="text-sm font-medium mb-2"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t("device.renameLabel")}
              </Text>
              <TextInput
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setNameError(null);
                }}
                placeholder={t("newServer.namePh")}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoCorrect={false}
                autoFocus
                maxLength={60}
                className="px-4 py-3 text-base"
                style={{
                  backgroundColor: theme.colors.surfaceContainerHigh,
                  color: theme.colors.onSurface,
                  borderRadius: 28,
                }}
              />
              {nameError ? (
                <Text
                  className="text-xs mt-1.5"
                  style={{ color: theme.colors.error }}
                >
                  {nameError}
                </Text>
              ) : null}
              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={handleSaveName}
                  disabled={!name.trim() || name.trim() === record.customName}
                  className="flex-1 rounded-[28px] py-3 items-center active:opacity-80"
                  style={{
                    backgroundColor: theme.colors.primary,
                    opacity:
                      !name.trim() || name.trim() === record.customName
                        ? 0.5
                        : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("sessionSettings.save")}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: theme.colors.onPrimary }}
                  >
                    {t("sessionSettings.save")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setRenaming(false);
                    setName(record.customName);
                    setNameError(null);
                  }}
                  className="flex-1 rounded-[28px] py-3 items-center active:opacity-80"
                  style={{ backgroundColor: theme.colors.surfaceVariant }}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.cancel")}
                >
                  <Text
                    className="font-semibold"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {t("common.cancel")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="pt-1">
              <SheetRow
                icon={<Pencil size={20} color={iconColor} />}
                label={t("device.menuRename")}
                onPress={() => {
                  setName(record.customName);
                  setNameError(null);
                  setRenaming(true);
                }}
              />
              <SheetRow
                icon={<Link2 size={20} color={iconColor} />}
                label={t("device.menuRepair")}
                onPress={() => {
                  onClose();
                  router.push("/server/pair");
                }}
              />
              <SheetRow
                icon={<RefreshCw size={20} color={iconColor} />}
                label={t("device.menuCheck")}
                onPress={() => {
                  onClose();
                  onCheck();
                }}
              />
              <SheetRow
                icon={<Trash2 size={20} color={theme.colors.error} />}
                label={t("device.menuDelete")}
                labelColor={theme.colors.error}
                onPress={() => {
                  setConfirmingDelete(true);
                }}
              />
            </View>
          )}
          <Pressable
            onPress={onClose}
            className="rounded-[28px] py-3 mt-2 items-center active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          >
            <Text
              className="font-semibold"
              style={{ color: theme.colors.primary }}
            >
              {t("common.cancel")}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
