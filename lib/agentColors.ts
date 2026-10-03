export interface AgentRole {
  container: "primaryContainer" | "secondaryContainer" | "tertiaryContainer";
  content:
    | "onPrimaryContainer"
    | "onSecondaryContainer"
    | "onTertiaryContainer";
}

// Mode-semantic colors (DeepSeek-R1-purple-switch idea, M3 roles): the
// executing agent reads brand blue, the reasoning/planning agent reads
// tertiary, everything else reads secondary. Keys, not values, so light
// and dark themes both resolve correctly.
export function agentRole(name: string): AgentRole {
  const key = name.toLowerCase();

  if (key === "plan") {
    return { container: "tertiaryContainer", content: "onTertiaryContainer" };
  }

  if (key === "build") {
    return { container: "primaryContainer", content: "onPrimaryContainer" };
  }

  return { container: "secondaryContainer", content: "onSecondaryContainer" };
}

export function agentInitial(name: string): string {
  const first = name.trim().charAt(0);

  return first ? first.toUpperCase() : "?";
}
