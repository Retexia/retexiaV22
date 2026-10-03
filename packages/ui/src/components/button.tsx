import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full type-label transition-hover focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand shadow-soft hover:bg-brand-hover active:bg-brand-hover",
  secondary:
    "border border-line bg-surface-raised text-brand shadow-soft hover:border-line-strong hover:text-brand-hover",
  ghost: "text-ink-muted hover:bg-surface-sunk hover:text-ink",
  danger: "bg-danger text-on-danger shadow-soft hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-4",
  md: "h-10 px-5",
  lg: "h-12 px-6 text-[14px]",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
  fullWidth,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  fullWidth?: boolean;
}) {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Icon element shown before the label. */
  icon?: ReactNode;
  /** Icon element shown after the label. */
  iconAfter?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined };
type AsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
    disabled?: boolean;
    prefetch?: boolean;
  };

export type ButtonProps = AsButton | AsLink;

/** True for links that leave the Next.js app (other sites, mail, phone, WhatsApp). */
export function isExternalHref(href: string) {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel|sms|whatsapp):/i.test(href);
}

/**
 * Pill button. Pass `href` to render a link that looks like a button.
 * `loading` shows a spinner and blocks clicks.
 */
export function Button(props: ButtonProps) {
  const { variant, size, loading, fullWidth, icon, iconAfter, children, className, ...rest } = props;
  const classes = buttonClasses({ variant, size, className, fullWidth });
  const content = (
    <>
      {loading ? <LoaderCircle aria-hidden size={16} strokeWidth={1.5} className="animate-spin" /> : icon}
      {children}
      {iconAfter}
    </>
  );

  if (typeof rest.href === "string") {
    const { href, disabled, prefetch, target, rel, ...anchor } = rest as AsLink;
    const external = isExternalHref(href);
    const linkProps = {
      ...anchor,
      className: classes,
      "aria-disabled": disabled || loading || undefined,
      tabIndex: disabled ? -1 : anchor.tabIndex,
      target: target ?? (external && /^https?:/i.test(href) ? "_blank" : undefined),
      rel: rel ?? (external ? "noopener noreferrer" : undefined),
    };
    if (external || href.startsWith("#")) {
      return (
        <a href={href} {...linkProps}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { type = "button", disabled, ...button } = rest as AsButton;
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...button}
    >
      {content}
    </button>
  );
}
