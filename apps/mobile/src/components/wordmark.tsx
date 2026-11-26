import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Mark } from "./mark";
import { Txt } from "./ui";

/** "Retexia" + the product chip in the product colour (like the panels' sidebar). */
export function Wordmark({ product }: { product?: { name: string; color: string; soft: string } }) {
  const { c, scheme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Mark size={22} color={scheme === "dark" ? "#ffffff" : undefined} />
      <Txt style={{ fontFamily: "Outfit_400Regular", fontSize: 24, lineHeight: 30, color: c.ink, letterSpacing: -0.3 }}>Retexia</Txt>
      {product ? (
        <View style={{ backgroundColor: product.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Txt variant="label" style={{ color: product.color }}>
            {product.name}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
