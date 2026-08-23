import React, { useEffect, useRef } from "react";
import {
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
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { MotiView } from "moti";
import { MotiPressable } from "moti/interactions";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
} from "react-native-reanimated";
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
  return (
    <MotiView
      from={{ opacity: 0, translateY: reducedMotion ? 0 : distance }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration, delay }}
      style={style}
    >
      {children}
    </MotiView>
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
  return (
    <MotiView
      from={{ opacity: 0, scale: reducedMotion ? 1 : 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", delay, damping: 14, stiffness: 140 }}
      style={style}
    >
      {children}
    </MotiView>
  );
}

// ─── Pressable with spring press feedback ─────────────────────
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
  return (
    <MotiPressable
      onPress={onPress}
      disabled={disabled}
      animate={({ pressed }: { pressed: boolean }) => {
        "worklet";
        return { scale: pressed && !reducedMotion ? scaleTo : 1, opacity: pressed ? 0.9 : 1 };
      }}
      transition={{ type: "spring", damping: 16, stiffness: 500 }}
      style={style as any}
    >
      {children}
    </MotiPressable>
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
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion ? (value ? 1 : 0) : withSpring(value ? 1 : 0, { damping: 15, stiffness: 220 });
  }, [value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 2 + progress.value * 16 }],
  }));

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onValueChange(!value)} style={[s.switchTrack, { backgroundColor: value ? c.dawn : c.line }]}>
      <Animated.View style={[s.switchThumb, thumbStyle]} />
    </TouchableOpacity>
  );
}

// ─── Time badge (AM/PM dot + mono time) ────────────────────────
export function TimeBadge({ time, period, pulse = false }: { time: string; period: "morning" | "afternoon"; pulse?: boolean }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const dotColor = period === "morning" ? c.dawn : c.dusk;
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse || reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [pulse, reducedMotion]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={s.timeBadge}>
      <Animated.View style={[s.timeDot, { backgroundColor: dotColor }, pulse && dotStyle]} />
      <Text style={[s.timeBadgeText, { color: c.textPrimary, fontFamily: Fonts.mono }]}>{time}</Text>
    </View>
  );
}

// ─── Sun arc — the HopIn signature mark ────────────────────────
// A real vector arc tracing sunrise (dawn dot) to sunset (dusk dot), with a
// gradient stroke between them — literally the sun's path across the day,
// which is what the whole color system represents. When `animated`, the
// arc actually draws itself stroke-first (SVG dash-offset, worklet-driven
// on the UI thread via Reanimated), rather than faking motion.
const ARC_PATH = "M 10 55 A 40 40 0 0 1 90 55";
const ARC_LENGTH = Math.PI * 40; // semicircle circumference, r=40
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function SunArc({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const gradientId = useRef(`sunarc-${Math.random().toString(36).slice(2)}`).current;
  const progress = useSharedValue(animated && !reducedMotion ? 0 : 1);
  const opacity = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) return;
    opacity.value = withTiming(1, { duration: 200 });
    progress.value = withTiming(1, { duration: reducedMotion ? 1 : 900, easing: Easing.out(Easing.cubic) });
  }, [animated]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const pathAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ARC_LENGTH * (1 - progress.value),
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, containerStyle]}>
      <Svg width={size} height={size} viewBox="0 0 100 65">
        <Defs>
          <LinearGradient id={gradientId} x1="10" y1="0" x2="90" y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={c.dawn} />
            <Stop offset="1" stopColor={c.dusk} />
          </LinearGradient>
        </Defs>
        <AnimatedPath
          d={ARC_PATH}
          stroke={`url(#${gradientId})`}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${ARC_LENGTH}, ${ARC_LENGTH}`}
          animatedProps={pathAnimatedProps}
        />
        <Circle cx="10" cy="55" r="4" fill={c.dawn} />
        <Circle cx="90" cy="55" r="4" fill={c.dusk} />
      </Svg>
    </Animated.View>
  );
}

// ─── Title rule — small signature accent under a primary heading ──
export function TitleRule({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[s.titleRule, { backgroundColor: c.dawn }, style]} />;
}

// Precomputed points along the arc (piecewise, smooth enough for a slow-
// moving dot) so Reanimated's interpolate — which is linear, not
// trig-aware — can drive position along the same M 10 55 A 40 40 0 0 1
// 90 55 path SunArc draws.
const ARC_STEPS = 24;
const arcProgressStops: number[] = [];
const arcCxStops: number[] = [];
const arcCyStops: number[] = [];
for (let i = 0; i <= ARC_STEPS; i++) {
  const p = i / ARC_STEPS;
  const theta = Math.PI * (1 + p);
  arcProgressStops.push(p);
  arcCxStops.push(50 + 40 * Math.cos(theta));
  arcCyStops.push(55 + 40 * Math.sin(theta));
}

// ─── Ambient background watermark (large, faint SunArc) ────────
// Meant as a sibling behind a screen's ScrollView, not inside its scrolling
// content — fills otherwise-dead space with a quiet, on-brand presence. A
// small sun-colored dot slowly traces the arc back and forth — literally
// the sun crossing the sky — rather than the whole shape rotating (which
// just looks broken for an asymmetric arc).
export function Watermark({ size = 320 }: { size?: number }) {
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const gradientId = useRef(`watermark-${Math.random().toString(36).slice(2)}`).current;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 6000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [reducedMotion]);

  const dotAnimatedProps = useAnimatedProps(() => ({
    cx: interpolate(progress.value, arcProgressStops, arcCxStops),
    cy: interpolate(progress.value, arcProgressStops, arcCyStops),
  }));

  return (
    <View pointerEvents="none" style={[s.watermark, { width: size, height: size, right: -size * 0.3, bottom: -size * 0.3 }]}>
      <View style={{ opacity: 0.14 }}>
        <Svg width={size} height={size} viewBox="0 0 100 65">
          <Defs>
            <LinearGradient id={gradientId} x1="10" y1="0" x2="90" y2="0" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={c.dawn} />
              <Stop offset="1" stopColor={c.dusk} />
            </LinearGradient>
          </Defs>
          <Path d={ARC_PATH} stroke={`url(#${gradientId})`} strokeWidth={2} strokeLinecap="round" fill="none" />
          <Circle cx="10" cy="55" r="3" fill={c.dawn} />
          <Circle cx="90" cy="55" r="3" fill={c.dusk} />
          {!reducedMotion && (
            <>
              <AnimatedCircle animatedProps={dotAnimatedProps} r="9" fill={c.dusk} opacity={0.35} />
              <AnimatedCircle animatedProps={dotAnimatedProps} r="4.5" fill={c.dusk} />
            </>
          )}
        </Svg>
      </View>
    </View>
  );
}

// ─── Grouped list section (replaces one-box-per-row patterns) ──
// Dividers are inserted automatically between whatever children actually
// render (falsy conditional children are dropped by React.Children.toArray),
// so callers never have to track which row happens to be "last".
export function ListSection({ label, children, style }: { label?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const rows = React.Children.toArray(children);
  return (
    <View style={style}>
      {label && <Text style={[s.sectionLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>{label}</Text>}
      <View style={[s.listSection, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {row}
            {i < rows.length - 1 && <View style={[s.listDivider, { backgroundColor: c.line }]} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export function ListRow({
  label,
  value,
  onPress,
  danger,
  chevron = true,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  const c = useTheme();
  const content = (
    <View style={s.listRow}>
      <Text style={[s.listRowLabel, { color: danger ? c.rust : c.textPrimary, fontFamily: Fonts.bodyMedium }]}>{label}</Text>
      <View style={s.listRowRight}>
        {value && <Text style={[s.listRowValue, { color: c.textSecondary, fontFamily: Fonts.body }]} numberOfLines={1}>{value}</Text>}
        {onPress && chevron && <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginLeft: 6 }} />}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {content}
    </TouchableOpacity>
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
  watermark: { position: "absolute" },
  titleRule: { width: 28, height: 2, borderRadius: 1, marginTop: 8, marginBottom: 4 },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginLeft: 2,
  },
  listSection: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  listDivider: { height: StyleSheet.hairlineWidth },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: Spacing.lg,
  },
  listRowLabel: { fontSize: FontSizes.base },
  listRowRight: { flexDirection: "row", alignItems: "center", flexShrink: 1, marginLeft: Spacing.md },
  listRowValue: { fontSize: FontSizes.md, flexShrink: 1, textAlign: "right" },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingLogo: { fontSize: 24, letterSpacing: -0.5, textAlign: "center", marginTop: 16 },
  loadingMessage: { fontSize: FontSizes.sm, marginTop: Spacing.md },
  emptyState: { alignItems: "center", textAlign: "center", paddingVertical: Spacing.xl },
  emptyTitle: { fontSize: FontSizes.lg, marginBottom: 6, textAlign: "center" },
  emptyMessage: { fontSize: FontSizes.sm, lineHeight: 20, textAlign: "center" },
});
