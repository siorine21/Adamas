import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RosterEntry } from "./types";
import { buildPresetRoster } from "./data/roster";
import { loadRoster, saveRoster, type SaveState } from "./storage";

interface StoreCtx {
  roster: RosterEntry[];
  setRoster: (updater: RosterEntry[] | ((prev: RosterEntry[]) => RosterEntry[])) => void;
  updateEntry: (key: string, patch: Partial<RosterEntry> | ((e: RosterEntry) => RosterEntry)) => void;
  removeEntry: (key: string) => void;
  addEntry: (entry: RosterEntry) => void;
  resetToPreset: () => void;
  saveState: SaveState;
  saveError: string | null;
  starredCount: number;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [roster, setRosterState] = useState<RosterEntry[]>(() => {
    const loaded = loadRoster();
    return loaded ?? buildPresetRoster();
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const firstRun = useRef(true);
  const timer = useRef<number | undefined>(undefined);

  // 変更のたびにデバウンス自動保存
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const res = saveRoster(roster);
      if (res.ok) {
        setSaveState("saved");
        setSaveError(null);
      } else {
        setSaveState("error");
        setSaveError(res.error ?? "不明なエラー");
      }
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [roster]);

  const setRoster = useCallback<StoreCtx["setRoster"]>((updater) => {
    setRosterState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const updateEntry = useCallback<StoreCtx["updateEntry"]>((key, patch) => {
    setRosterState((prev) =>
      prev.map((e) => {
        if (e.key !== key) return e;
        return typeof patch === "function" ? patch(e) : { ...e, ...patch };
      }),
    );
  }, []);

  const removeEntry = useCallback((key: string) => {
    setRosterState((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const addEntry = useCallback((entry: RosterEntry) => {
    setRosterState((prev) => [...prev, entry]);
  }, []);

  const resetToPreset = useCallback(() => {
    setRosterState(buildPresetRoster());
  }, []);

  const starredCount = roster.filter((e) => e.starred).length;

  return (
    <Ctx.Provider
      value={{ roster, setRoster, updateEntry, removeEntry, addEntry, resetToPreset, saveState, saveError, starredCount }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
