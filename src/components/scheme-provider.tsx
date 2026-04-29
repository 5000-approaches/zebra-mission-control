"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { DEFAULT_SCHEME, SCHEME_STORAGE_KEY } from "@/lib/schemes";

type SchemeCtx = { scheme: string; setScheme: (s: string) => void };
const Ctx = createContext<SchemeCtx>({ scheme: DEFAULT_SCHEME, setScheme: () => {} });

export function SchemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_SCHEME;
    return localStorage.getItem(SCHEME_STORAGE_KEY) ?? DEFAULT_SCHEME;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-scheme", scheme);
  }, [scheme]);

  const setScheme = useCallback((s: string) => {
    setSchemeState(s);
    localStorage.setItem(SCHEME_STORAGE_KEY, s);
    document.documentElement.setAttribute("data-scheme", s);
  }, []);

  return <Ctx value={{ scheme, setScheme }}>{children}</Ctx>;
}

export const useScheme = () => useContext(Ctx);
