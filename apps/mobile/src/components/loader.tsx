import { loaderMotion } from "@retexia/shared/tokens";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Txt } from "./ui";

/**
 * The Retexia loading line, the same motion as the web (packages/ui loading.tsx + theme.css):
 * two gradient segments glide left → right through a brand-soft track, 1.4s,
 * cubic-bezier(0.65, 0, 0.35, 1); the second is 18% wide, 0.7 opacity, 0.5s later.
 * Reduced motion: one still full-width line.
 */
const [x1, y1, x2, y2] = loaderMotion.easing;
const EASE = Easing.bezier(x1, y1, x2, y2);

function Segment({ track, width, delayMs, opacity, running }: { track: number; width: number; delayMs: number; opacity: number; running: boolean }) {
  const { c } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!running) {
      cancelAnimation(p);
      return;
    }
    p.value = 0;
    p.value = withDelay(delayMs, withRepeat(withTiming(1, { duration: loaderMotion.durationMs, easing: EASE }), -1, false));
    return () => cancelAnimation(p);
  }, [p, delayMs, running]);
  // left: -40% → 100% of the track (both segments, like the CSS keyframes).
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -0.4 * track + p.value * 1.4 * track }] }));
  return (
    <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: width * track, opacity, borderRadius: 999, overflow: "hidden" }, style]}>
      <LinearGradient
        colors={["transparent", c.brand, c.brandHover, "transparent"]}
        locations={[0, 0.35, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

function Line({ width, height = 3, running = true, trackOpacity = 1 }: { width: number; height?: number; running?: boolean; trackOpacity?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  return (
    <View style={{ width, height, borderRadius: 999, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.brandSoft, opacity: trackOpacity }} />
      {reduced ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.brand }} />
      ) : (
        loaderMotion.segments.map((s, i) => <Segment key={i} track={width} width={s.width} delayMs={s.delayMs} opacity={s.opacity} running={running} />)
      )}
    </View>
  );
}

/** Page or section loading: the word "Retexia" over the gliding line. */
export function RetexiaLoader({ label = "Loading" }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 48 }}>
      <Txt color="inkMuted" style={{ fontFamily: "Outfit_400Regular", fontSize: 20, lineHeight: 26, letterSpacing: 1 }}>
        Retexia
      </Txt>
      <Line width={160} />
    </View>
  );
}

/**
 * A 3px line at the top of the screen while anything waits on the server: appears after 150ms (no
 * flicker), stays at least 400ms, fades out in 200ms.
 */
export function ProgressLine() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [on, setOn] = useState(false);
  const since = useRef(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (busy && !on) {
      t = setTimeout(() => {
        since.current = Date.now();
        setOn(true);
      }, loaderMotion.showAfterMs);
    } else if (!busy && on) {
      t = setTimeout(() => setOn(false), Math.max(0, loaderMotion.minVisibleMs - (Date.now() - since.current)));
    }
    return () => clearTimeout(t);
  }, [busy, on]);
  useEffect(() => {
    opacity.value = withTiming(on ? 1 : 0, { duration: loaderMotion.fadeMs });
  }, [on, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: insets.top, left: 0, right: 0, height: 3, zIndex: 50 }, style]}>
      <Line width={width} running={on} trackOpacity={0.7} />
    </Animated.View>
  );
}
