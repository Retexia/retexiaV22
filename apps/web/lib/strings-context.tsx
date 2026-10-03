"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Translate } from "./strings";

const StringsContext = createContext<Record<string, string>>({});

export function StringsProvider({ strings, children }: { strings: Record<string, string>; children: ReactNode }) {
  return <StringsContext.Provider value={strings}>{children}</StringsContext.Provider>;
}

/** `t(key, fallback)` for Client Components. */
export function useT(): Translate {
  const strings = useContext(StringsContext);
  return useMemo(() => makeT(strings), [strings]);
}
