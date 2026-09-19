import { createMMKV } from "react-native-mmkv";
import { StateStorage } from "zustand/middleware";

const storage = createMMKV({ id: "opencode-mobile-storage" });

export const zustandStorage: StateStorage = {
  getItem: (name: string) => {
    try {
      const value = storage.getString(name);

      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      storage.set(name, value);
    } catch {
      // Storage full or unavailable — state stays in memory.
    }
  },
  removeItem: (name: string) => {
    try {
      storage.remove(name);
    } catch {
      // Already gone or unavailable.
    }
  },
};
