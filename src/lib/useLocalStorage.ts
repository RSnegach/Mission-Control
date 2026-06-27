"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe localStorage state. Returns `fallback` on the first render (server and
 * first client render match, so no hydration mismatch), then reads the stored
 * value in an effect. Writes persist. Storage failures (private mode) are ignored.
 */
export function useLocalStorage<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore
    }
    // read once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // ignore
    }
  };

  return [value, set];
}

export const LS_PRESET = "mc-trend-preset";
export const LS_THRESHOLDS = "mc-thresholds";
export const LS_LIVE = "mc-live-refresh";
