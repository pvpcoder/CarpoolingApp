/**
 * RidePool Design System
 * Clean, confident, human.
 */

import { Platform } from 'react-native';

export const Colors = {
  // Backgrounds – warm-neutral dark palette
  bg: '#111214',
  bgCard: '#1A1B1F',
  bgElevated: '#222328',
  bgInput: '#1A1B1F',
  bgSurface: '#16171B',

  // Primary – soft green
  primary: '#34D399',
  primaryDark: '#10B981',
  primaryFaded: 'rgba(52, 211, 153, 0.10)',
  primaryBorder: 'rgba(52, 211, 153, 0.22)',
  primaryGlow: 'rgba(52, 211, 153, 0.06)',

  // Danger / destructive
  accent: '#F87171',
  accentFaded: 'rgba(248, 113, 113, 0.10)',
  accentBorder: 'rgba(248, 113, 113, 0.22)',

  // Info
  info: '#60A5FA',
  infoFaded: 'rgba(96, 165, 250, 0.10)',
  infoBorder: 'rgba(96, 165, 250, 0.22)',

  // Warm / warning
  warm: '#FBBF24',
  warmFaded: 'rgba(251, 191, 36, 0.10)',
  warmBorder: 'rgba(251, 191, 36, 0.22)',

  // Text – high contrast hierarchy
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  textMuted: '#4B5563',

  // Borders
  border: '#27282E',
  borderLight: '#222328',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.6)',
  success: '#34D399',
  successFaded: 'rgba(52, 211, 153, 0.10)',
};

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
  md: 14,
  lg: 20,
  xl: 24,
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
  hero: 36,
};

export const Shadows = Platform.select({
  ios: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
    },
  },
  default: {
    sm: { elevation: 2 },
    md: { elevation: 6 },
    lg: { elevation: 12 },
  },
});
