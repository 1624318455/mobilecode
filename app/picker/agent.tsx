import { router } from "expo-router";
import { FlatList } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Avatar, List, RadioButton } from "react-native-paper";

import { useAppTheme } from "@/components/Material3ThemeProvider";
import { agentInitial, agentRole } from "@/lib/agentColors";
import { usePickerStore } from "@/stores/picker";

export default function AgentPickerModal() {
  const theme = useAppTheme();
  const agents = usePickerStore((s) => s.agents);
  const selectedAgent = usePickerStore((s) => s.selectedAgent);
  const setSelectedAgent = usePickerStore((s) => s.setSelectedAgent);

  function select(name: string) {
    setSelectedAgent(name);
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <FlatList
        data={agents}
        keyExtractor={(item) => item.name}
        renderItem={({ item: agent }) => {
          const selected = selectedAgent === agent.name;
          const role = agentRole(agent.name);

          return (
            <List.Item
              title={agent.name}
              titleStyle={{ textTransform: "capitalize" }}
              onPress={() => {
                select(agent.name);
              }}
              left={() => (
                <Avatar.Text
                  size={36}
                  label={agentInitial(agent.name)}
                  style={{ backgroundColor: theme.colors[role.container] }}
                  labelStyle={{ color: theme.colors[role.content] }}
                />
              )}
              right={() => (
                <RadioButton.Android
                  value={agent.name}
                  status={selected ? "checked" : "unchecked"}
                  color={theme.colors[role.content]}
                  onPress={() => {
                    select(agent.name);
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
