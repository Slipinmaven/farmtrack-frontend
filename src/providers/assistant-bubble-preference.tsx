import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import { useAuth } from "@/providers/auth-provider";

type PreferenceState = {
  userId: string | null;
  enabled: boolean;
  loaded: boolean;
  error: string | null;
};

type AssistantBubblePreferenceValue = PreferenceState & {
  setEnabled: (enabled: boolean) => Promise<void>;
};

const PreferenceContext =
  createContext<AssistantBubblePreferenceValue | null>(null);
const memoryValues = new Map<string, string>();
const preferenceKey = (userId: string) =>
  `farmtrack.assistant-bubble.${userId}`;

async function readPreference(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof localStorage === "undefined"
      ? (memoryValues.get(key) ?? null)
      : localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function savePreference(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") memoryValues.set(key, value);
    else localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export function AssistantBubblePreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<PreferenceState>({
    userId: null,
    enabled: true,
    loaded: false,
    error: null,
  });

  useEffect(() => {
    let active = true;
    if (!userId) return;
    void readPreference(preferenceKey(userId))
      .then((value) => {
        if (active) {
          setState({
            userId,
            enabled: value !== "false",
            loaded: true,
            error: null,
          });
        }
      })
      .catch(() => {
        if (active) {
          setState({
            userId,
            enabled: true,
            loaded: true,
            error: "Could not load the assistant shortcut preference.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!userId) return;
      try {
        await savePreference(preferenceKey(userId), String(enabled));
        setState((current) =>
          current.userId === userId
            ? { userId, enabled, loaded: true, error: null }
            : current,
        );
      } catch {
        setState((current) =>
          current.userId === userId
            ? {
                ...current,
                error: "Could not save this preference. Please try again.",
              }
            : current,
        );
      }
    },
    [userId],
  );

  const value = useMemo(
    () => ({
      ...state,
      enabled: state.userId === userId ? state.enabled : true,
      loaded: state.userId === userId && state.loaded,
      setEnabled,
    }),
    [setEnabled, state, userId],
  );

  return (
    <PreferenceContext.Provider value={value}>
      {children}
    </PreferenceContext.Provider>
  );
}

export function useAssistantBubblePreference(): AssistantBubblePreferenceValue {
  const context = useContext(PreferenceContext);
  if (!context) {
    throw new Error(
      "useAssistantBubblePreference must be used inside its provider.",
    );
  }
  return context;
}
