"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { DEFAULT_MODE, MODE_STORAGE_KEY, type Mode } from "@/lib/schemes";

type ModeCtx = { mode: Mode; setMode: (m: Mode) => void };
const Ctx = createContext<ModeCtx>({ mode: DEFAULT_MODE, setMode: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    const saved = localStorage.getItem(MODE_STORAGE_KEY) as Mode | null;
    return saved === "light" || saved === "dark" ? saved : DEFAULT_MODE;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
  }, [mode]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem(MODE_STORAGE_KEY, m);
    document.documentElement.setAttribute("data-mode", m);
  }, []);

  return <Ctx value={{ mode, setMode }}>{children}</Ctx>;
}

export const useMode = () => useContext(Ctx);
