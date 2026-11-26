import Svg, { Path } from "react-native-svg";

/** The Retexia mark (packages/ui/src/brand/retexia-mark.svg). */
export const MARK_BLUE = "#005DE0";
export function Mark({ size = 24, color = MARK_BLUE }: { size?: number; color?: string }) {
  return (
    <Svg width={size * (765 / 684)} height={size} viewBox="269 276 765 684" fill={color} accessibilityLabel="Retexia">
      <Path d="M269 276H700C835 276 932 365 932 488C932 580 870 655 776 678L1034 959H870L539 578H693C745 578 784 540 784 488C784 435 745 398 693 398H377Z" />
      <Path d="M376 485L818 959H693L500 740V959H376Z" />
    </Svg>
  );
}
