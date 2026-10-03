"use client";

import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

const known = new Set<string>(iconNames);

/** A product's Lucide icon by stored name; a neutral box when the name is unknown. */
export function ProductIcon({ name, size = 20, className }: { name: string | null | undefined; size?: number; className?: string }) {
  if (name && known.has(name)) return <DynamicIcon name={name as IconName} size={size} strokeWidth={1.5} className={className} aria-hidden />;
  return <DynamicIcon name="box" size={size} strokeWidth={1.5} className={className} aria-hidden />;
}
