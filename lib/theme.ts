/**
 * HopIn Design System — "Departure Board"
 *
 * Every day in HopIn has a morning leg and an afternoon leg, each needing a
 * driver. `dawn` and `dusk` are the only saturated colors in the system and
 * are used functionally: every AM element is `dawn`, every PM element is
 * `dusk` — never swapped decoratively.
 */

import { Platform, useColorScheme } from "react-native";

export type ThemeTokens = typeof lightTokens;

const lightTokens = {
  ink: "#14171F",
  paper: "#F5F3EE",
  paperElevated: "#FFFFFF",
  dawn: "#4C5FD5",
  dawnFaded: "rgba(76, 95, 213, 0.10)",
  dawnBorder: "rgba(76, 95, 213, 0.24)",
  dusk: "#E8853A",
  duskFaded: "rgba(232, 133, 58, 0.12)",
  duskBorder: "rgba(232, 133, 58, 0.26)",
  line: "#DDD8CC",
  rust: "#C2503F",
  rustFaded: "rgba(194, 80, 63, 0.10)",
  rustBorder: "rgba(194, 80, 63, 0.24)",
  textPrimary: "#14171F",
  textSecondary: "#5B5A52",
  textMuted: "#9B978A",
};

const darkTokens = {
  ink: "#F2F0EA",
  paper: "#14161C",
  paperElevated: "#1B1E26",
  dawn: "#7C8BF0",
  dawnFaded: "rgba(124, 139, 240, 0.14)",
  dawnBorder: "rgba(124, 139, 240, 0.28)",
  dusk: "#F2A05C",
  duskFaded: "rgba(242, 160, 92, 0.14)",
  duskBorder: "rgba(242, 160, 92, 0.30)",
  line: "#2A2D35",
  rust: "#E2695A",
  rustFaded: "rgba(226, 105, 90, 0.14)",
  rustBorder: "rgba(226, 105, 90, 0.28)",
  textPrimary: "#F2F0EA",
  textSecondary: "#A7A498",
  textMuted: "#5F5D55",
};

export function useTheme(): ThemeTokens {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTokens : lightTokens;
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const Radius = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 38,
};

// Space Grotesk (display) + Inter (body) are a real designed pairing from the
// same type foundry. Space Mono (utility) carries every time/count value —
// a literal split-flap departure-board reference.
export const Fonts = {
  display: "SpaceGrotesk_700Bold",
  displaySemiBold: "SpaceGrotesk_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "SpaceMono_400Regular",
  monoBold: "SpaceMono_700Bold",
};

export const Shadows = Platform.select({
  ios: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10,
      shadowRadius: 16,
    },
  },
  default: {
    sm: { elevation: 2 },
    md: { elevation: 6 },
  },
});
