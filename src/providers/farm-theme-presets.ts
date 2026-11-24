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
    name: "Sienna",
    description: "Rich clay with a soft golden accent",
    primary: "#80513A",
    secondary: "#C38A45",
    light: {
      background: "#F6F1EB",
      backgroundElement: "#FFFEFC",
      backgroundSelected: "#EDE2D6",
      text: "#302820",
      textSecondary: "#695D52",
      border: "#DCD0C4",
    },
    dark: {
      background: "#191613",
      backgroundElement: "#25201B",
      backgroundSelected: "#382D25",
      text: "#F3EEE8",
      textSecondary: "#B5A89A",
      border: "#493D33",
    },
  },
  {
    name: "Orchard",
    description: "Deep berry with a warm blush accent",
    primary: "#704C69",
    secondary: "#C77B69",
    light: {
      background: "#F7F1F6",
      backgroundElement: "#FFFEFF",
      backgroundSelected: "#ECE0EA",
      text: "#2E2530",
      textSecondary: "#6D5E6B",
      border: "#DED2DC",
    },
    dark: {
      background: "#19151A",
      backgroundElement: "#252027",
      backgroundSelected: "#382E3B",
      text: "#F4EDF4",
      textSecondary: "#B6AAB8",
      border: "#493D4C",
    },
  },
  {
    name: "Bluebird",
    description: "Calm slate blue with a golden accent",
    primary: "#405D7A",
    secondary: "#C9824A",
    light: {
      background: "#F0F4F8",
      backgroundElement: "#FFFFFF",
      backgroundSelected: "#DCE7F1",
      text: "#202A35",
      textSecondary: "#5B6877",
      border: "#CED9E4",
    },
    dark: {
      background: "#141A20",
      backgroundElement: "#1F2831",
      backgroundSelected: "#2D3B49",
      text: "#EFF3F7",
      textSecondary: "#AAB7C3",
      border: "#3D4B58",
    },
  },
  {
    name: "Lagoon",
    description: "Deep teal with a soft coral accent",
    primary: "#1D666B",
    secondary: "#D98670",
    light: {
      background: "#EFF6F5",
      backgroundElement: "#FFFFFF",
      backgroundSelected: "#D8E9E7",
      text: "#1E3031",
      textSecondary: "#5A7070",
      border: "#C9DCDA",
    },
    dark: {
      background: "#111B1C",
      backgroundElement: "#1C292A",
      backgroundSelected: "#293B3D",
      text: "#EDF4F3",
      textSecondary: "#A5B8B8",
      border: "#384B4D",
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
    const lagoon = farmThemePresets.find((preset) => preset.name === "Lagoon");
    return lagoon ?? farmThemePresets[0];
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
