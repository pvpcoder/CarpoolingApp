import React, { useEffect, useRef } from "react";
import {
  Animated,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, Spacing, Radius, FontSizes, Fonts, Shadows } from "../lib/theme";
import { useReducedMotion } from "../lib/motion";

// ─── Fade-in on mount ─────────────────────────────────────────
export function FadeIn({
  delay = 0,
  duration = 280,
  distance = 8,
  children,
  style,
}: {
  delay?: number;
  duration?: number;
  distance?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(reducedMotion ? 0 : distance)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Scale-in (for hero / signature elements) ─────────────────
export function ScaleIn({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, delay, friction: 10, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Pressable with spring press feedback ─────────────────────
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function PressableScale({
  onPress,
  disabled,
  children,
  style,
  scaleTo = 0.97,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (reducedMotion) return;
    Animated.spring(scale, { toValue: scaleTo, friction: 9, tension: 300, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    if (reducedMotion) return;
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 300, useNativeDriver: true }).start();
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
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={disabled || loading} style={[s.primaryBtn, { backgroundColor: c.dawn }, (disabled || loading) && s.btnDisabled, style]}>
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon as any} size={18} color="#FFFFFF" />}
          <Text style={[s.primaryBtnText, { fontFamily: Fonts.bodySemiBold }]}>{title}</Text>
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
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={disabled || loading} style={[s.secondaryBtn, { backgroundColor: c.paperElevated, borderColor: c.line }, (disabled || loading) && s.btnDisabled, style]}>
      {loading ? (
        <ActivityIndicator size="small" color={c.dawn} />
      ) : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon as any} size={18} color={c.textPrimary} />}
          <Text style={[s.secondaryBtnText, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{title}</Text>
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
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <PressableScale onPress={onPress} style={[s.dangerBtn, { backgroundColor: c.rustFaded, borderColor: c.rustBorder }, style]}>
      <View style={s.btnInner}>
        {icon && <Ionicons name={icon as any} size={18} color={c.rust} />}
        <Text style={[s.dangerBtnText, { color: c.rust, fontFamily: Fonts.bodySemiBold }]}>{title}</Text>
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
  style?: StyleProp<ViewStyle>;
  highlight?: "dawn" | "dusk" | "rust";
}) {
  const c = useTheme();
  const borderColor = highlight === "dawn" ? c.dawnBorder : highlight === "dusk" ? c.duskBorder : highlight === "rust" ? c.rustBorder : c.line;
  return (
    <View style={[s.card, { backgroundColor: c.paperElevated, borderColor }, style]}>
      {children}
    </View>
  );
}

// ─── Status Banner ────────────────────────────────────────────
export function Banner({
  icon,
  title,
  message,
  variant = "neutral",
  style,
}: {
  icon?: string;
  title: string;
  message: string;
  variant?: "dawn" | "dusk" | "rust" | "neutral";
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const variantStyles = {
    dawn: { bg: c.dawnFaded, border: c.dawnBorder, text: c.dawn },
    dusk: { bg: c.duskFaded, border: c.duskBorder, text: c.dusk },
    rust: { bg: c.rustFaded, border: c.rustBorder, text: c.rust },
    neutral: { bg: c.paperElevated, border: c.line, text: c.textPrimary },
  };
  const v = variantStyles[variant];

  return (
    <View style={[s.banner, { backgroundColor: v.bg, borderColor: v.border }, style]}>
      <View style={s.bannerHeader}>
        {icon && <Ionicons name={icon as any} size={18} color={v.text} style={{ marginRight: 8 }} />}
        <Text style={[s.bannerTitle, { color: v.text, fontFamily: Fonts.bodySemiBold }]}>{title}</Text>
      </View>
      <Text style={[s.bannerMessage, { color: c.textSecondary, fontFamily: Fonts.body }, icon ? { marginLeft: 26 } : undefined]}>{message}</Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────
export function SectionHeader({ title, style }: { title: string; style?: TextStyle }) {
  const c = useTheme();
  return <Text style={[s.sectionHeader, { color: c.textPrimary, fontFamily: Fonts.display }, style]}>{title}</Text>;
}

// ─── Back button ──────────────────────────────────────────────
export function BackButton({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  return (
    <TouchableOpacity onPress={onPress} style={s.backBtn} activeOpacity={0.6} hitSlop={12}>
      <View style={[s.backBtnCircle, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
        <Ionicons name="chevron-back" size={18} color={c.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Toggle switch ─────────────────────────────────────────────
export function ToggleSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const translate = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(translate, { toValue: value ? 1 : 0, useNativeDriver: true, friction: 8, tension: 200, ...(reducedMotion ? { friction: 100 } : {}) }).start();
  }, [value]);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onValueChange(!value)} style={[s.switchTrack, { backgroundColor: value ? c.dawn : c.line }]}>
      <Animated.View
        style={[
          s.switchThumb,
          {
            transform: [{ translateX: translate.interpolate({ inputRange: [0, 1], outputRange: [2, 18] }) }],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

// ─── Time badge (AM/PM dot + mono time) ────────────────────────
export function TimeBadge({ time, period }: { time: string; period: "morning" | "afternoon" }) {
  const c = useTheme();
  const dotColor = period === "morning" ? c.dawn : c.dusk;
  return (
    <View style={s.timeBadge}>
      <View style={[s.timeDot, { backgroundColor: dotColor }]} />
      <Text style={[s.timeBadgeText, { color: c.textPrimary, fontFamily: Fonts.mono }]}>{time}</Text>
    </View>
  );
}

// ─── Sun arc — the HopIn signature mark ────────────────────────
// A dawn-to-dusk ring built from plain Views (no SVG dependency): four
// independently-colored borders on a circle, rotated so the seam reads as a
// diagonal split from the morning color to the afternoon color.
export function SunArc({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(animated && !reducedMotion ? 0.6 : 1)).current;
  const rotate = useRef(new Animated.Value(animated && !reducedMotion ? -1 : 0)).current;
  const opacity = useRef(new Animated.Value(animated ? 0 : 1)).current;

  useEffect(() => {
    if (!animated) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      Animated.spring(rotate, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [animated]);

  const borderWidth = Math.max(2, Math.round(size * 0.08));
  const dotSize = Math.max(6, Math.round(size * 0.16));

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        opacity,
        transform: [
          { scale },
          { rotate: rotate.interpolate({ inputRange: [-1, 0], outputRange: ["-45deg", "45deg"] }) },
        ],
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderTopColor: c.dawn,
          borderLeftColor: c.dawn,
          borderRightColor: c.dusk,
          borderBottomColor: c.dusk,
        }}
      />
      <View style={{ position: "absolute", top: -dotSize / 2, left: size / 2 - dotSize / 2, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: c.dawn }} />
      <View style={{ position: "absolute", bottom: -dotSize / 2, left: size / 2 - dotSize / 2, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: c.dusk }} />
    </Animated.View>
  );
}

// ─── Loading screen ───────────────────────────────────────────
export function LoadingScreen({ message }: { message?: string }) {
  const c = useTheme();
  return (
    <View style={[s.loadingScreen, { backgroundColor: c.paper }]}>
      <ScaleIn>
        <SunArc size={48} />
      </ScaleIn>
      <FadeIn delay={150}>
        <Text style={[s.loadingLogo, { color: c.textPrimary, fontFamily: Fonts.display }]}>HopIn</Text>
      </FadeIn>
      <ActivityIndicator size="small" color={c.dawn} style={{ marginTop: 20 }} />
      {message && <Text style={[s.loadingMessage, { color: c.textMuted, fontFamily: Fonts.body }]}>{message}</Text>}
    </View>
  );
}

// ─── Empty state ────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const c = useTheme();
  return (
    <Card style={s.emptyState}>
      {icon && <Ionicons name={icon as any} size={28} color={c.textMuted} style={{ marginBottom: 10 }} />}
      <Text style={[s.emptyTitle, { color: c.textPrimary, fontFamily: Fonts.displaySemiBold }]}>{title}</Text>
      <Text style={[s.emptyMessage, { color: c.textSecondary, fontFamily: Fonts.body }]}>{message}</Text>
      {actionLabel && onAction && (
        <PrimaryButton title={actionLabel} onPress={onAction} style={{ marginTop: Spacing.lg, alignSelf: "stretch" }} />
      )}
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  primaryBtn: {
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  primaryBtnText: { color: "#FFFFFF", fontSize: FontSizes.base, letterSpacing: 0.1 },
  secondaryBtn: {
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    minHeight: 54,
  },
  secondaryBtnText: { fontSize: FontSizes.base, letterSpacing: 0.1 },
  dangerBtn: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    minHeight: 50,
  },
  dangerBtnText: { fontSize: FontSizes.base },
  btnDisabled: { opacity: 0.45 },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...(Shadows?.sm as object),
  },
  banner: {
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  bannerHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  bannerTitle: { fontSize: FontSizes.md },
  bannerMessage: { fontSize: FontSizes.sm, lineHeight: 19 },
  sectionHeader: { fontSize: FontSizes.lg, marginBottom: Spacing.md, letterSpacing: -0.3 },
  backBtn: { alignSelf: "flex-start", marginBottom: Spacing.lg },
  backBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  timeBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeDot: { width: 7, height: 7, borderRadius: 3.5 },
  timeBadgeText: { fontSize: FontSizes.sm },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingLogo: { fontSize: 24, letterSpacing: -0.5, textAlign: "center", marginTop: 16 },
  loadingMessage: { fontSize: FontSizes.sm, marginTop: Spacing.md },
  emptyState: { alignItems: "center", textAlign: "center", paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSizes.lg, marginBottom: 6, textAlign: "center" },
  emptyMessage: { fontSize: FontSizes.sm, lineHeight: 20, textAlign: "center" },
});
