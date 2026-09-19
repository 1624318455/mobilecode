import { router } from "expo-router";
import { FlatList } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { List, RadioButton } from "react-native-paper";

import { usePickerStore } from "@/stores/picker";

export default function AgentPickerModal() {
  const agents = usePickerStore((s) => s.agents);
  const selectedAgent = usePickerStore((s) => s.selectedAgent);
  const setSelectedAgent = usePickerStore((s) => s.setSelectedAgent);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <FlatList
        data={agents}
        keyExtractor={(item) => item.name}
        renderItem={({ item: agent }) => {
          const selected = selectedAgent === agent.name;

          return (
            <List.Item
              title={agent.name}
              titleStyle={{ textTransform: "capitalize" }}
              onPress={() => {
                setSelectedAgent(agent.name);
                router.back();
              }}
              right={() => (
                <RadioButton.Android
                  value={agent.name}
                  status={selected ? "checked" : "unchecked"}
                  onPress={() => {
                    setSelectedAgent(agent.name);
                    router.back();
                  }}
                />
              )}
            />
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}
