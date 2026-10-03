/** Reading and writing list filters in the URL (search, page, sort, filters). */
export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 25;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export function listParams(sp: SearchParams, defaultSort: { id: string; desc: boolean }) {
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const sortRaw = param(sp, "sort");
  const sort = sortRaw
    ? { id: sortRaw.replace(/^-/, ""), desc: sortRaw.startsWith("-") }
    : defaultSort;
  return { q: param(sp, "q"), page, sort, from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 };
}

/** Same URL with some params changed (undefined/"" removes a param; page resets unless set). */
export function withParams(pathname: string, sp: SearchParams, changes: Record<string, string | number | null | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) next.set(k, s);
  }
  if (!("page" in changes)) next.delete("page");
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === null || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Escape a search term for PostgREST ilike filters. */
export function ilike(term: string) {
  return `%${term.toLowerCase().replace(/[%_\\,()*]/g, " ").trim()}%`;
}
