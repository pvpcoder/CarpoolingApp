/**
 * HopIn Design System
 * Dark & premium. Blue primary.
 */

import { Platform } from 'react-native';

export const Colors = {
  // Backgrounds – deep navy-black with blue undertones
  bg: '#0A0E17',
  bgCard: '#111827',
  bgElevated: '#1E293B',
  bgInput: '#111827',
  bgSurface: '#0F1629',

  // Primary – blue
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryFaded: 'rgba(59, 130, 246, 0.10)',
  primaryBorder: 'rgba(59, 130, 246, 0.22)',
  primaryGlow: 'rgba(59, 130, 246, 0.06)',

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

  // Text – cooler slate-based hierarchy
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textMuted: '#475569',

  // Borders – cooler
  border: '#1E293B',
  borderLight: '#1E293B',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.6)',
  success: '#3B82F6',
  successFaded: 'rgba(59, 130, 246, 0.10)',
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

export const Gradients = {
  hero: ['#0F172A', '#1E3A5F', '#0F172A'] as const,
  heroSubtle: ['#0A0E17', '#162032', '#0A0E17'] as const,
  card: ['rgba(30,58,95,0.4)', 'rgba(17,24,39,0.9)'] as const,
};

export const Shadows = Platform.select({
  ios: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.20,
      shadowRadius: 16,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 30,
    },
  },
  default: {
    sm: { elevation: 3 },
    md: { elevation: 8 },
    lg: { elevation: 14 },
  },
});
