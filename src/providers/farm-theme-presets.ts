export type ThemeSurfaceSet = {
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  text: string;
  textSecondary: string;
  border: string;
};

export type FarmThemePreset = {
  name: string;
  description: string;
  primary: string;
  secondary: string;
  light: ThemeSurfaceSet;
  dark: ThemeSurfaceSet;
};

export const farmThemePresets: FarmThemePreset[] = [
  {
    name: "Canopy",
    description: "Leaf green with warm harvest accents",
    primary: "#31594E",
    secondary: "#D88C32",
    light: {
      background: "#F2F6F1",
      backgroundElement: "#FFFFFF",
      backgroundSelected: "#DFE9E0",
      text: "#213128",
      textSecondary: "#63746A",
      border: "#D1DDD3",
    },
    dark: {
      background: "#131B16",
      backgroundElement: "#1D2921",
      backgroundSelected: "#2A3A2E",
      text: "#F0F5F1",
      textSecondary: "#AAB8AE",
      border: "#38483C",
    },
  },
  {
    name: "Harvest",
    description: "Clear blue with a golden counterpoint",
    primary: "#236A8A",
    secondary: "#D19A32",
    light: {
      background: "#F0F6F8",
      backgroundElement: "#FFFFFF",
      backgroundSelected: "#DDEBF0",
      text: "#1C3038",
      textSecondary: "#5F7882",
      border: "#CEDDE2",
    },
    dark: {
      background: "#111B1F",
      backgroundElement: "#1C2A30",
      backgroundSelected: "#293C43",
      text: "#EDF4F6",
      textSecondary: "#A3B7BE",
      border: "#384A50",
    },
  },
  {
    name: "Earth",
    description: "Warm soil brown with a fresh green accent",
    primary: "#684B36",
    secondary: "#57977E",
    light: {
      background: "#F5F1ED",
      backgroundElement: "#FFFCF8",
      backgroundSelected: "#EAE1D8",
      text: "#332921",
      textSecondary: "#76685A",
      border: "#DED2C6",
    },
    dark: {
      background: "#1E1915",
      backgroundElement: "#29221C",
      backgroundSelected: "#3A3028",
      text: "#F4EEE7",
      textSecondary: "#BAAA98",
      border: "#493C31",
    },
  },
  {
    name: "Terracotta",
    description: "Red clay paired with deep teal",
    primary: "#A84C35",
    secondary: "#286A62",
    light: {
      background: "#F9F2EF",
      backgroundElement: "#FFFEFD",
      backgroundSelected: "#F0E0D9",
      text: "#38261F",
      textSecondary: "#806D63",
      border: "#E4D2C9",
    },
    dark: {
      background: "#201713",
      backgroundElement: "#2E211B",
      backgroundSelected: "#443027",
      text: "#F5EDE8",
      textSecondary: "#BBA99D",
      border: "#4D392E",
    },
  },
  {
    name: "Meadow",
    description: "Olive green balanced with orchard orange",
    primary: "#596F31",
    secondary: "#C67535",
    light: {
      background: "#F4F6EF",
      backgroundElement: "#FFFFFF",
      backgroundSelected: "#E5EBD9",
      text: "#283021",
      textSecondary: "#68735B",
      border: "#D8E0CE",
    },
    dark: {
      background: "#171B12",
      backgroundElement: "#23291D",
      backgroundSelected: "#323B29",
      text: "#F0F3EA",
      textSecondary: "#AEB79F",
      border: "#414A37",
    },
  },
  {
    name: "Coast",
    description: "Tidal teal with a muted coral accent",
    primary: "#226B68",
    secondary: "#BF6C52",
    light: {
      background: "#EFF6F4",
      backgroundElement: "#FFFFFF",
      backgroundSelected: "#DDEBE8",
      text: "#1C302F",
      textSecondary: "#5D7774",
      border: "#CEDDD9",
    },
    dark: {
      background: "#111B1A",
      backgroundElement: "#1B2A28",
      backgroundSelected: "#293C39",
      text: "#EDF5F3",
      textSecondary: "#A2B8B4",
      border: "#394C48",
    },
  },
];

function normalizedHex(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (/^#[\dA-F]{6}$/.test(normalized)) return normalized;
  if (/^#[\dA-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return null;
}

export function getFarmThemePreset(primaryColor: string): FarmThemePreset {
  const normalized = normalizedHex(primaryColor);
  if (!normalized) {
    const coast = farmThemePresets.find((preset) => preset.name === "Coast");
    return coast ?? farmThemePresets[0];
  }

  return (
    farmThemePresets.find((preset) => preset.primary === normalized) ??
    farmThemePresets.reduce((closest, preset) => {
      const distance = (color: string) => {
        const channels = [1, 3, 5].map((index) =>
          Number.parseInt(color.slice(index, index + 2), 16),
        );
        const targetChannels = [1, 3, 5].map((index) =>
          Number.parseInt(normalized.slice(index, index + 2), 16),
        );
        return channels.reduce(
          (total, channel, index) =>
            total + (channel - targetChannels[index]) ** 2,
          0,
        );
      };
      return distance(preset.primary) < distance(closest.primary)
        ? preset
        : closest;
    })
  );
}
