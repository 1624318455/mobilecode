import { router } from "expo-router";
import { useMemo, useState } from "react";
import { SectionList, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { List, RadioButton, Searchbar, Text } from "react-native-paper";

import { ModelInfo } from "@/hooks/useModels";
import { useAppTheme } from "@/components/Material3ThemeProvider";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/lib/i18n";
import { usePickerStore } from "@/stores/picker";

export default function ModelPickerModal() {
  const theme = useAppTheme();
  const { t } = useT();
  const models = usePickerStore((s) => s.models);
  const selectedModel = usePickerStore((s) => s.selectedModel);
  const setSelectedModel = usePickerStore((s) => s.setSelectedModel);
  const [search, setSearch] = useState("");

  const sections = useMemo(() => {
    const query = search.toLowerCase();
    const filtered = search
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.providerID.toLowerCase().includes(query),
        )
      : models;

    const grouped = new Map<string, ModelInfo[]>();
    for (const model of filtered) {
      const existing = grouped.get(model.providerID);
      if (existing) {
        existing.push(model);
      } else {
        grouped.set(model.providerID, [model]);
      }
    }

    return Array.from(grouped.entries()).map(([providerID, data]) => ({
      title: providerID,
      data,
    }));
  }, [models, search]);

  return (
    <SectionList
      renderScrollComponent={(props) => (
        <KeyboardAwareScrollView {...props} extraKeyboardSpace={100} />
      )}
      sections={sections}
      keyExtractor={(item) => `${item.providerID}/${item.id}`}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ padding: 16 }}>
          <Searchbar
            placeholder={t("pickers.searchModels")}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <List.Subheader
          style={{
            backgroundColor: theme.colors.background,
            color: theme.colors.onSurfaceVariant,
          }}
        >
          {section.title}
        </List.Subheader>
      )}
      renderItem={({ item: model }) => {
        const isSelected =
          selectedModel?.id === model.id &&
          selectedModel?.providerID === model.providerID;

        return (
          <List.Item
            title={model.name}
            titleNumberOfLines={1}
            onPress={() => {
              setSelectedModel(model);
              router.back();
            }}
            right={() => (
              <RadioButton.Android
                value={`${model.providerID}/${model.id}`}
                status={isSelected ? "checked" : "unchecked"}
                onPress={() => {
                  setSelectedModel(model);
                  router.back();
                }}
              />
            )}
          />
        );
      }}
      ListEmptyComponent={
        <EmptyState
          kind="models"
          title={t("pickers.noModels")}
          body={t("pickers.noModelsBody")}
        />
      }
    />
  );
}
