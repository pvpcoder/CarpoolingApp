import React, { useEffect, useRef } from 'react';
import {
  Animated,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSizes, Shadows, Gradients } from '../lib/theme';

// ─── Fade-in on mount ─────────────────────────────────────────
export function FadeIn({
  delay = 0,
  duration = 350,
  children,
  style,
}: {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Scale-in (for hero elements) ─────────────────────────────
export function ScaleIn({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        delay,
        friction: 10,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[{ opacity, transform: [{ scale }] }, style]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Pressable button with scale feedback ─────────────────────
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function PressableScale({
  onPress,
  disabled,
  children,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedTouchable
      activeOpacity={0.85}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedTouchable>
  );
}

// ─── Primary Button ───────────────────────────────────────────
export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        s.primaryBtn,
        (disabled || loading) && s.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon as any} size={18} color="#FFFFFF" />}
          <Text style={s.primaryBtnText}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

// ─── Secondary Button ─────────────────────────────────────────
export function SecondaryButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        s.secondaryBtn,
        (disabled || loading) && s.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon as any} size={18} color={Colors.textPrimary} />}
          <Text style={s.secondaryBtnText}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

// ─── Danger/Outline Button ────────────────────────────────────
export function DangerButton({
  title,
  onPress,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: string;
  style?: ViewStyle;
}) {
  return (
    <PressableScale onPress={onPress} style={[s.dangerBtn, style]}>
      <View style={s.btnInner}>
        {icon && <Ionicons name={icon as any} size={18} color={Colors.accent} />}
        <Text style={s.dangerBtnText}>{title}</Text>
      </View>
    </PressableScale>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────
export function Card({
  children,
  style,
  highlight,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  highlight?: 'primary' | 'accent' | 'info' | 'warm';
}) {
  const borderColor = highlight
    ? highlight === 'primary' ? Colors.primaryBorder
      : highlight === 'accent' ? Colors.accentBorder
      : highlight === 'info' ? Colors.infoBorder
      : Colors.warmBorder
    : 'transparent';

  return (
    <View style={[s.card, { borderColor, borderWidth: highlight ? 1 : 0 }, style]}>
      {children}
    </View>
  );
}

// ─── Status Banner ────────────────────────────────────────────
export function Banner({
  icon,
  title,
  message,
  variant = 'info',
  style,
}: {
  icon?: string;
  title: string;
  message: string;
  variant?: 'info' | 'warning' | 'success' | 'error';
  style?: ViewStyle;
}) {
  const variantStyles = {
    info: { bg: Colors.infoFaded, border: Colors.infoBorder, text: Colors.info },
    warning: { bg: Colors.warmFaded, border: Colors.warmBorder, text: Colors.warm },
    success: { bg: Colors.successFaded, border: Colors.primaryBorder, text: Colors.success },
    error: { bg: Colors.accentFaded, border: Colors.accentBorder, text: Colors.accent },
  };
  const v = variantStyles[variant];

  return (
    <View style={[s.banner, { backgroundColor: v.bg, borderColor: v.border }, style]}>
      <View style={s.bannerHeader}>
        {icon && <Ionicons name={icon as any} size={18} color={v.text} style={{ marginRight: 8 }} />}
        <Text style={[s.bannerTitle, { color: v.text }]}>{title}</Text>
      </View>
      <Text style={[s.bannerMessage, icon ? { marginLeft: 26 } : undefined]}>{message}</Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────
export function SectionHeader({ title, style }: { title: string; style?: TextStyle }) {
  return <Text style={[s.sectionHeader, style]}>{title}</Text>;
}

// ─── Back button ──────────────────────────────────────────────
export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.backBtn} activeOpacity={0.6}>
      <View style={s.backBtnCircle}>
        <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Loading screen ───────────────────────────────────────────
export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={s.loadingScreen}>
      <ScaleIn>
        <View style={s.loadingLogoWrap}>
          <Ionicons name="navigate" size={28} color="#FFFFFF" />
        </View>
      </ScaleIn>
      <FadeIn delay={200}>
        <Text style={s.loadingLogo}>HopIn</Text>
      </FadeIn>
      <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
      {message && <Text style={s.loadingMessage}>{message}</Text>}
    </View>
  );
}

// ─── Gradient Header ─────────────────────────────────────────
export function GradientHeader({
  children,
  style,
  colors,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  colors?: readonly string[];
}) {
  return (
    <LinearGradient
      colors={(colors || Gradients.hero) as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.gradientHeader, style]}
    >
      {children}
    </LinearGradient>
  );
}

// ─── Stat Pill ───────────────────────────────────────────────
export function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: string;
}) {
  return (
    <View style={s.statPill}>
      {icon && <Ionicons name={icon as any} size={14} color={Colors.primary} style={{ marginRight: 6 }} />}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Icon Button ─────────────────────────────────────────────
export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 44,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  const iconColor = color || Colors.primary;
  return (
    <PressableScale onPress={onPress} style={s.iconButton}>
      <View style={[s.iconButtonCircle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name={icon as any} size={size * 0.45} color={iconColor} />
      </View>
      <Text style={s.iconButtonLabel} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

// ─── Input ────────────────────────────────────────────────────
export { default as TextInput } from 'react-native';

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: FontSizes.base,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    minHeight: 54,
  },
  secondaryBtnText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.base,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  dangerBtn: {
    backgroundColor: Colors.accentFaded,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    minHeight: 50,
  },
  dangerBtnText: {
    color: Colors.accent,
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows?.md,
  },
  banner: {
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  bannerMessage: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    lineHeight: 19,
  },
  sectionHeader: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  backBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogoWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  loadingLogo: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  loadingMessage: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    marginTop: Spacing.md,
  },
  // Gradient Header
  gradientHeader: {
    paddingTop: 56,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  // Stat Pill
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  statValue: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 4,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  // Icon Button
  iconButton: {
    alignItems: 'center',
    width: 64,
  },
  iconButtonCircle: {
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconButtonLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
