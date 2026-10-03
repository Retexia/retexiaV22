import * as Lucide from "lucide-react";
import type { LucideProps } from "lucide-react";
import { createElement, type ComponentType } from "react";

const NOT_ICONS = new Set(["Icon", "LucideProvider", "createLucideIcon", "icons", "useLucideContext"]);

function toPascal(name: string) {
  return name
    .trim()
    .replace(/Icon$/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Resolve a Lucide icon from a name stored in the database ("message-circle"). */
export function resolveIcon(name: string | null | undefined): ComponentType<LucideProps> | null {
  if (!name) return null;
  const key = /^[A-Z]/.test(name) ? name : toPascal(name);
  if (!key || NOT_ICONS.has(key)) return null;
  const candidate = (Lucide as unknown as Record<string, unknown>)[key];
  if (candidate && typeof candidate === "object" && "$$typeof" in candidate) {
    return candidate as ComponentType<LucideProps>;
  }
  return null;
}

export type IconProps = Omit<LucideProps, "ref" | "name"> & {
  /** Lucide icon name, e.g. "message-circle". */
  name?: string | null;
  /** Icon used when the name is empty or unknown. */
  fallback?: string;
  /** Accessible label. Without it the icon is decorative (aria-hidden). */
  label?: string;
};

/**
 * Renders a Lucide icon by name (outline, 1.5px stroke). For Server Components:
 * importing it in a Client Component would bundle every icon.
 */
export function Icon({ name, fallback = "circle", label, size = 20, strokeWidth = 1.5, ...props }: IconProps) {
  const Component = resolveIcon(name) ?? resolveIcon(fallback) ?? Lucide.Circle;
  // createElement: the icon is looked up by name at render time on purpose.
  return createElement(Component, {
    size,
    strokeWidth,
    "aria-hidden": label ? undefined : true,
    "aria-label": label,
    role: label ? "img" : undefined,
    focusable: "false",
    ...props,
  });
}
