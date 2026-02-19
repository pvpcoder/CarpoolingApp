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
import { Colors, Spacing, Radius, FontSizes } from '../lib/theme';

// ─── Fade-in on mount ─────────────────────────────────────────
export function FadeIn({
  delay = 0,
  duration = 500,
  children,
  style,
}: {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

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
        <ActivityIndicator size="small" color={Colors.bg} />
      ) : (
        <Text style={s.primaryBtnText}>
          {icon ? `${icon}  ${title}` : title}
        </Text>
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
        <Text style={s.secondaryBtnText}>
          {icon ? `${icon}  ${title}` : title}
        </Text>
      )}
    </PressableScale>
  );
}

// ─── Danger/Outline Button ────────────────────────────────────
export function DangerButton({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <PressableScale onPress={onPress} style={[s.dangerBtn, style]}>
      <Text style={s.dangerBtnText}>{title}</Text>
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
    : Colors.border;

  return (
    <View style={[s.card, { borderColor }, style]}>
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
      <Text style={[s.bannerTitle, { color: v.text }]}>
        {icon ? `${icon}  ${title}` : title}
      </Text>
      <Text style={s.bannerMessage}>{message}</Text>
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
        <Text style={s.backBtnArrow}>{'<'}</Text>
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
          <Text style={s.loadingLogoIcon}>R</Text>
        </View>
      </ScaleIn>
      <FadeIn delay={200}>
        <Text style={s.loadingLogo}>RidePool</Text>
      </FadeIn>
      <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
      {message && <Text style={s.loadingMessage}>{message}</Text>}
    </View>
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
  primaryBtnText: {
    color: Colors.bg,
    fontSize: FontSizes.base,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
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
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  banner: {
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  bannerTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: 4,
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
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnArrow: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: -1,
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
  loadingLogoIcon: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.bg,
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
});
