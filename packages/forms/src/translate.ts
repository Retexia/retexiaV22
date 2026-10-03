/**
 * UI text lookup. `t(key, fallback)` returns the site_strings value, or the
 * fallback written in code when the key is missing. `{name}` placeholders are
 * filled from `vars`.
 */
export type Translate = (key: string, fallback: string, vars?: Record<string, string | number>) => string;

export function makeT(strings: Record<string, string>): Translate {
  return (key, fallback, vars) => {
    const template = strings[key] ?? fallback;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
  };
}

/** Fallback-only translator (no site_strings loaded). */
export const fallbackT: Translate = makeT({});
