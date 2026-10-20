import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { z } from "zod";

import type { FarmSettings } from "@/features/farms/types";
import { cacheSettings, readCachedSettings } from "@/lib/storage/farm";
import {
  farmThemePresets,
  getFarmThemePreset,
} from "@/providers/farm-theme-presets";
import { useFarm } from "@/providers/farm-provider";

const themeModes = ["light", "dark", "system"] as const;
const settingsSchema = z.object({
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  font_family: z.string().nullable().optional(),
  font_scale: z.union([z.number(), z.string()]).nullable().optional(),
  theme_mode: z.enum(themeModes).nullable().optional(),
  currency: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});

export type ThemePreviewSettings = Pick<
  FarmSettings,
  | "primary_color"
  | "secondary_color"
  | "theme_mode"
  | "font_family"
  | "font_scale"
>;

export type ThemePreviewState = {
  farmId: string;
  settings: ThemePreviewSettings;
};

export type ThemeTokens = {
  mode: "light" | "dark";
  savedMode: (typeof themeModes)[number];
  primary: string;
  secondary: string;
  onPrimary: string;
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  border: string;
  danger: string;
  success: string;
  fontFamily: string | undefined;
  fontFamilySemibold: string | undefined;
  fontScale: number;
  currency: string;
  timezone: string;
};

type ThemeContextValue = {
  theme: ThemeTokens;
  error: Error | null;
  refreshSettings: () => Promise<void>;
  setPreview: Dispatch<SetStateAction<ThemePreviewState | null>>;
};

const fallback: ThemeTokens = {
  mode: "light",
  savedMode: "system",
  primary: "#226B68",
  secondary: "#BF6C52",
  onPrimary: "#FFFFFF",
  text: "#1C302F",
  background: "#EFF6F4",
  backgroundElement: "#FFFFFF",
  backgroundSelected: "#DDEBE8",
  textSecondary: "#5D7774",
  border: "#CEDDD9",
  danger: "#B33B32",
  success: "#287353",
  fontFamily: "Inter_400Regular",
  fontFamilySemibold: "Inter_600SemiBold",
  fontScale: 1,
  currency: "KES",
  timezone: "Africa/Nairobi",
};

const colorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

function validColor(
  value: string | null | undefined,
  fallbackValue: string,
): string {
  return value && colorPattern.test(value) ? value : fallbackValue;
}

function relativeLuminance(color: string): number {
  const normalized =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  return [1, 3, 5]
    .map((start) => parseInt(normalized.slice(start, start + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

function contrastRatio(
  firstLuminance: number,
  secondLuminance: number,
): number {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableText(color: string): string {
  const backgroundLuminance = relativeLuminance(color);
  const darkText = "#17211A";
  const darkTextContrast = contrastRatio(
    relativeLuminance(darkText),
    backgroundLuminance,
  );
  const lightTextContrast = contrastRatio(1, backgroundLuminance);
  return darkTextContrast >= lightTextContrast ? darkText : "#FFFFFF";
}

function normalizeSettings(
  settings: Partial<FarmSettings> | null,
  systemDark: boolean,
): ThemeTokens {
  const parsed = settingsSchema.safeParse(settings ?? {});
  const values = parsed.success ? parsed.data : {};
  const savedMode = values.theme_mode ?? "system";
  const mode =
    savedMode === "system" ? (systemDark ? "dark" : "light") : savedMode;
  const fontScaleValue = Number(values.font_scale ?? 1);
  const fontScale =
    Number.isFinite(fontScaleValue) &&
    fontScaleValue >= 0.75 &&
    fontScaleValue <= 1.5
      ? fontScaleValue
      : 1;
  const primary = validColor(values.primary_color, fallback.primary);
  const preset = getFarmThemePreset(primary);
  const isPresetColor = farmThemePresets.some(
    (item) => item.primary === primary.toUpperCase(),
  );
  const surfaces = mode === "dark" ? preset.dark : preset.light;
  const useSystemFont = values.font_family?.toLowerCase() === "system";
  return {
    ...fallback,
    ...surfaces,
    mode,
    savedMode,
    primary,
    secondary: isPresetColor
      ? preset.secondary
      : validColor(values.secondary_color, preset.secondary),
    onPrimary: readableText(primary),
    fontFamily: useSystemFont ? undefined : "Inter_400Regular",
    fontFamilySemibold: useSystemFont ? undefined : "Inter_600SemiBold",
    fontScale,
    currency:
      values.currency && /^[A-Z]{3}$/.test(values.currency)
        ? values.currency
        : fallback.currency,
    timezone: values.timezone?.trim() || fallback.timezone,
  };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const {
    selectedFarm,
    status: farmStatus,
    refreshFarms,
    error: farmError,
  } = useFarm();
  const systemScheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold });
  const [cachedEntry, setCachedEntry] = useState<{
    farmId: string;
    settings: FarmSettings | null;
  } | null>(null);
  const [preview, setPreview] = useState<ThemePreviewState | null>(null);
  const farmId = selectedFarm?.id;
  const serverSettings = selectedFarm?.settings ?? null;

  useEffect(() => {
    let active = true;
    if (farmId) {
      void readCachedSettings(farmId)
        .then((settings) => {
          if (active) setCachedEntry({ farmId, settings });
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [farmId]);

  useEffect(() => {
    if (serverSettings)
      void cacheSettings(serverSettings).catch(() => undefined);
  }, [serverSettings]);

  const cachedSettings =
    cachedEntry && cachedEntry.farmId === farmId ? cachedEntry.settings : null;
  const useCache = farmStatus === "initializing" || farmStatus === "error";
  const baseSettings = useCache ? cachedSettings : serverSettings;
  const previewSettings =
    preview && preview.farmId === farmId ? preview.settings : null;
  const themeSettings = previewSettings
    ? { ...(baseSettings ?? {}), ...previewSettings }
    : baseSettings;
  const normalizedTheme = normalizeSettings(
    themeSettings,
    systemScheme === "dark",
  );
  const theme = fontsLoaded
    ? normalizedTheme
    : {
        ...normalizedTheme,
        fontFamily: undefined,
        fontFamilySemibold: undefined,
      };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        error: farmError,
        refreshSettings: refreshFarms,
        setPreview,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider.");
  return context;
}
