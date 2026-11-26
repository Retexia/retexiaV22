import { Image } from "expo-image";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Txt } from "./ui";

/**
 * Chat bubbles like the web panel's (components/feeder/lingo-feeder/common.tsx): the customer on
 * the left (raised), Lingo on the right (success-soft), the seller on the right (brand-soft).
 * WhatsApp *bold* shows bold.
 */
type Tap = { id: string; title: string };

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <Txt variant="body" selectable>
      {parts.map((p, i) =>
        /^\*[^*\n]+\*$/.test(p) ? (
          <Txt key={i} variant="body" style={{ fontFamily: "DMSans_600SemiBold" }}>
            {p.slice(1, -1)}
          </Txt>
        ) : (
          p
        ),
      )}
    </Txt>
  );
}

export function Bubble({
  text, image, buttons, list, side = "out", tone = "lingo", meta, onTap,
}: {
  text?: string | null; image?: string | null; buttons?: { id?: string; title: string }[]; list?: { button: string; rows: { id?: string; title: string; description?: string }[] };
  side?: "in" | "out"; tone?: "lingo" | "seller" | "customer"; meta?: ReactNode; onTap?: (t: Tap) => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const bg = tone === "customer" ? c.surfaceRaised : tone === "seller" ? c.brandSoft : c.successSoft;
  return (
    <View style={{ maxWidth: "86%", alignSelf: side === "in" ? "flex-start" : "flex-end", gap: 4 }}>
      <View style={{ backgroundColor: bg, borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
        {image ? <Image source={{ uri: image }} style={{ width: 240, height: 200 }} contentFit="cover" accessibilityLabel="Product photo" /> : null}
        {text ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <Rich text={text} />
          </View>
        ) : null}
        {buttons?.length
          ? buttons.map((b, i) => (
              <Pressable
                key={i}
                disabled={!onTap || !b.id}
                onPress={() => b.id && onTap?.({ id: b.id, title: b.title })}
                style={({ pressed }) => ({ borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 10, alignItems: "center", backgroundColor: pressed ? c.surfaceSunk : "transparent" })}
              >
                <Txt variant="label" color="brand">
                  {b.title}
                </Txt>
              </Pressable>
            ))
          : null}
        {list ? (
          <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
            <Pressable onPress={() => setOpen(!open)} style={{ paddingVertical: 10, alignItems: "center" }}>
              <Txt variant="label" color="brand">
                ☰ {list.button}
              </Txt>
            </Pressable>
            {open
              ? list.rows.map((r, i) => (
                  <Pressable
                    key={i}
                    disabled={!onTap || !r.id}
                    onPress={() => r.id && onTap?.({ id: r.id, title: r.title })}
                    style={({ pressed }) => ({ borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: pressed ? c.surfaceSunk : c.surfaceRaised })}
                  >
                    <Txt variant="label">{r.title}</Txt>
                    {r.description ? (
                      <Txt variant="small" color="inkMuted">
                        {r.description}
                      </Txt>
                    ) : null}
                  </Pressable>
                ))
              : null}
          </View>
        ) : null}
      </View>
      {meta ? <View style={{ flexDirection: "row", gap: 6, justifyContent: side === "in" ? "flex-start" : "flex-end", paddingHorizontal: 4 }}>{meta}</View> : null}
    </View>
  );
}

type GraphBody = {
  type?: string; text?: { body?: string }; image?: { link?: string; caption?: string }; reaction?: { emoji?: string };
  interactive?: { type?: string; body?: { text?: string }; action?: { buttons?: { reply: { id: string; title: string } }[]; button?: string; sections?: { rows: { id: string; title: string; description?: string }[] }[] } };
};

/** A WhatsApp Graph API message body (as Lingo sends it, e.g. in Try Lingo) → a bubble. */
export function BodyBubble({ body, meta, onTap }: { body: Record<string, unknown>; meta?: ReactNode; onTap?: (t: Tap) => void }) {
  const b = body as GraphBody;
  if (b.type === "reaction") {
    return (
      <Txt variant="small" color="inkMuted" style={{ alignSelf: "flex-end", paddingHorizontal: 8 }}>
        Lingo reacted {b.reaction?.emoji} to the message
      </Txt>
    );
  }
  if (b.type === "image") return <Bubble image={b.image?.link} text={b.image?.caption} meta={meta} />;
  if (b.type === "interactive") {
    const a = b.interactive?.action;
    return (
      <Bubble
        text={b.interactive?.body?.text}
        buttons={b.interactive?.type === "button" ? (a?.buttons ?? []).map((x) => x.reply) : undefined}
        list={b.interactive?.type === "list" ? { button: a?.button ?? "", rows: a?.sections?.[0]?.rows ?? [] } : undefined}
        meta={meta}
        onTap={onTap}
      />
    );
  }
  return <Bubble text={b.text?.body} meta={meta} />;
}

/** A small centred note between bubbles ("Lingo didn't need to answer that."). */
export function Note({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignSelf: "center", backgroundColor: c.surfaceRaised, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: c.line }}>
      <Txt variant="small" color="inkMuted" style={{ textAlign: "center" }}>
        {children}
      </Txt>
    </View>
  );
}
