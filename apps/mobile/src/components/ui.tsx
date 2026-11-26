import type { TypeName } from "@retexia/shared/tokens";
import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { Children, forwardRef, useEffect, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator, Pressable, Switch as RNSwitch, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { shadow, typeStyle, useTheme, type Colors } from "@/lib/theme";

/**
 * The Retexia components for the app, matching @retexia/ui on the web: Txt (type scale),
 * Button, Card, Badge, Chip, Field + Input, Row, SwitchRow, Stat, EmptyState, Skeleton, Alert.
 * Icons: lucide, stroke 1.5.
 */

const SINHALA = /[඀-෿]/;
const hasSinhala = (children: ReactNode) => Children.toArray(children).some((c) => typeof c === "string" && SINHALA.test(c));

export type ToneName = "neutral" | "brand" | "success" | "warning" | "danger";
type ColorName = keyof Colors;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
export function Txt({ variant = "body", color = "ink", style, children, ...rest }: TextProps & { variant?: TypeName; color?: ColorName | (string & {}) }) {
  const { c } = useTheme();
  return (
    <Text {...rest} style={[typeStyle(variant, hasSinhala(children)), { color: (c as Record<string, string>)[color] ?? color }, style]}>
      {children}
    </Text>
  );
}

export const ICON = { size: 20, stroke: 1.5 } as const;
export function Icon({ icon: I, size = ICON.size, color = "inkMuted" }: { icon: LucideIcon; size?: number; color?: ColorName | (string & {}) }) {
  const { c } = useTheme();
  return <I size={size} strokeWidth={ICON.stroke} color={(c as Record<string, string>)[color] ?? color} />;
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  icon?: LucideIcon;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};
export function Button({ title, variant = "primary", size = "md", icon, loading, full, disabled, style, onPress, ...rest }: ButtonProps) {
  const { c } = useTheme();
  const bg = { primary: c.brand, secondary: c.surfaceRaised, ghost: "transparent", danger: c.danger }[variant];
  const fg = { primary: c.onBrand, secondary: c.ink, ghost: c.brand, danger: c.onDanger }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      onPress={(e) => {
        void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          minHeight: size === "md" ? 48 : 36,
          paddingHorizontal: size === "md" ? 20 : 14,
          borderRadius: 999,
          backgroundColor: bg,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: c.line,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "auto",
        },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon icon={icon} size={size === "md" ? 18 : 16} color={fg} /> : null}
      <Txt variant="label" style={{ color: fg, fontSize: size === "md" ? 15 : 13 }}>
        {title}
      </Txt>
    </Pressable>
  );
}

/** A round icon-only button (header actions, send). */
export function IconButton({ icon, label, onPress, color = "ink", disabled, tone }: { icon: LucideIcon; label: string; onPress: () => void; color?: ColorName; disabled?: boolean; tone?: "brand" }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center",
        backgroundColor: tone === "brand" ? c.brand : pressed ? c.surfaceSunk : "transparent", opacity: disabled ? 0.45 : 1,
      })}
    >
      <Icon icon={icon} color={tone === "brand" ? c.onBrand : color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ children, style, padded = true, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; onPress?: () => void }) {
  const { c, scheme } = useTheme();
  const base: ViewStyle = { backgroundColor: c.surfaceRaised, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: padded ? 16 : 0, gap: 12, ...shadow(scheme) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <Txt variant="eyebrow" color="inkMuted">
          {title}
        </Txt>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}

// ---------------------------------------------------------------------------
// Badges and chips
// ---------------------------------------------------------------------------
export function toneColors(c: Colors, tone: ToneName) {
  switch (tone) {
    case "brand":
      return { bg: c.brandSoft, fg: c.brand, border: c.brandSoft };
    case "success":
      return { bg: c.successSoft, fg: c.success, border: c.successSoft };
    case "warning":
      return { bg: c.warningSoft, fg: c.warning, border: c.warningSoft };
    case "danger":
      return { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft };
    default:
      return { bg: c.surfaceSunk, fg: c.inkMuted, border: c.line };
  }
}

export function Badge({ children, tone = "neutral", product }: { children: ReactNode; tone?: ToneName; product?: { color: string; soft: string } }) {
  const { c } = useTheme();
  const t = product ? { bg: product.soft, fg: product.color, border: product.soft } : toneColors(c, tone);
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Txt variant="small" style={{ color: t.fg, fontFamily: "DMSans_500Medium" }} numberOfLines={1}>
        {children}
      </Txt>
    </View>
  );
}

export function Chip({ label, count, active, onPress, tone }: { label: string; count?: number; active?: boolean; onPress: () => void; tone?: ToneName }) {
  const { c } = useTheme();
  const danger = tone === "danger" && (count ?? 0) > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{
        flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 999, borderWidth: 1,
        borderColor: active ? c.brand : danger ? c.dangerSoft : c.line,
        backgroundColor: active ? c.brandSoft : danger ? c.dangerSoft : c.surfaceRaised,
      }}
    >
      <Txt variant="small" style={{ color: active ? c.brand : danger ? c.danger : c.inkMuted, fontFamily: "DMSans_500Medium" }}>
        {label}
      </Txt>
      {count != null ? (
        <Txt variant="small" style={{ color: active ? c.brand : danger ? c.danger : c.inkMuted }}>
          {count.toLocaleString("en-US")}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Two to four options side by side (views, appearance). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surfaceSunk, borderRadius: 999, padding: 3, borderWidth: 1, borderColor: c.line }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            style={{ flex: 1, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surfaceRaised : "transparent" }}
          >
            <Txt variant="label" style={{ color: on ? c.ink : c.inkMuted, fontSize: 13 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export function Row({
  title, subtitle, icon, iconColor, right, onPress, chevron = Boolean(onPress), danger,
}: { title: string; subtitle?: string | null; icon?: LucideIcon; iconColor?: ColorName | (string & {}); right?: ReactNode; onPress?: () => void; chevron?: boolean; danger?: boolean }) {
  const { c } = useTheme();
  const body = (
    <>
      {icon ? <Icon icon={icon} color={danger ? "danger" : (iconColor ?? "inkMuted")} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" color={danger ? "danger" : "ink"} style={{ fontFamily: "DMSans_500Medium" }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="small" color="inkMuted" numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {chevron ? <Txt color="lineStrong" style={{ fontSize: 22, lineHeight: 22 }}>›</Txt> : null}
    </>
  );
  const style: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 52 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1, backgroundColor: pressed ? c.surfaceSunk : "transparent" }]}>
      {body}
    </Pressable>
  );
}

export function SwitchRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Row
      title={title}
      subtitle={subtitle}
      right={
        <RNSwitch
          accessibilityLabel={title}
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            void Haptics.selectionAsync();
            onChange(v);
          }}
          trackColor={{ true: c.brand, false: c.lineStrong }}
          thumbColor="#ffffff"
          ios_backgroundColor={c.lineStrong}
        />
      }
    />
  );
}

export function Stat({ label, value, tone, wide }: { label: string; value: string; tone?: ToneName; wide?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: wide ? 1.7 : 1, gap: 2 }}>
      <Txt variant="caption" color="inkMuted">
        {label}
      </Txt>
      <Txt variant="h1" style={{ color: tone ? toneColors(c, tone).fg : c.ink, fontSize: 22, lineHeight: 30 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      {children}
      {error ? (
        <Txt variant="small" color="danger">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="small" color="inkMuted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export type InputRef = ComponentRef<typeof TextInput>;
export const Input = forwardRef<InputRef, TextInputProps & { invalid?: boolean }>(function Input({ style, invalid, multiline, ...rest }, ref) {
  const { c } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.lineStrong}
      selectionColor={c.brand}
      multiline={multiline}
      style={[
        typeStyle("body-lg"),
        {
          color: c.ink, backgroundColor: c.surface, borderWidth: 1, borderColor: invalid ? c.danger : c.line, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: multiline ? 10 : 0, minHeight: 48, textAlignVertical: multiline ? "top" : "center",
        } satisfies TextStyle,
        style,
      ]}
      {...rest}
    />
  );
});

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export function Alert({ tone = "neutral", title, children, action }: { tone?: ToneName; title: string; children?: ReactNode; action?: ReactNode }) {
  const { c } = useTheme();
  const t = toneColors(c, tone);
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 12, borderWidth: 1, borderColor: t.border, padding: 14, gap: 6 }}>
      <Txt variant="h3" style={{ color: t.fg }}>
        {title}
      </Txt>
      {typeof children === "string" ? <Txt variant="body" color="ink">{children}</Txt> : children}
      {action ? <View style={{ marginTop: 4, alignItems: "flex-start" }}>{action}</View> : null}
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon icon={icon} size={24} color="brand" />
      </View>
      <Txt variant="h2" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {text ? (
        <Txt variant="body" color="inkMuted" style={{ textAlign: "center", maxWidth: 320 }}>
          {text}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

/** A grey block that pulses while data loads (rx-pulse: opacity .55 at the middle). */
export function Skeleton({ height = 16, width = "100%", radius = 6 }: { height?: number; width?: ViewStyle["width"]; radius?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.55, { duration: 800 }), -1, true);
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: c.surfaceSunk }, style]} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <Skeleton height={18} width="45%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </Card>
  );
}
