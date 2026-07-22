import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RosterEntry, Team } from "./types";
import { buildPresetRoster, makeKey } from "./data/roster";
import { buildTeamPreset, PRESET_TEAMS } from "./data/teams";
import { loadTeams, saveTeams, type SaveState, type TeamsState } from "./storage";

let teamCounter = 0;
function makeTeamId(): string {
  teamCounter += 1;
  return `team_${Date.now().toString(36)}_${teamCounter}`;
}

function cloneRoster(roster: RosterEntry[]): RosterEntry[] {
  return roster.map((e) => ({ ...(JSON.parse(JSON.stringify(e)) as RosterEntry), key: makeKey() }));
}

interface StoreCtx {
  // アクティブチームのロスター（既存コンポーネントはこれを見る）
  roster: RosterEntry[];
  setRoster: (updater: RosterEntry[] | ((prev: RosterEntry[]) => RosterEntry[])) => void;
  updateEntry: (key: string, patch: Partial<RosterEntry> | ((e: RosterEntry) => RosterEntry)) => void;
  removeEntry: (key: string) => void;
  addEntry: (entry: RosterEntry) => void;
  resetToPreset: () => void;
  // チーム管理
  teams: Team[];
  activeTeamId: string;
  activeTeam: Team | undefined;
  setActiveTeam: (id: string) => void;
  createTeam: (name?: string) => void;
  duplicateTeam: () => void;
  renameTeam: (name: string) => void;
  removeTeam: () => void;
  loadPresetTeam: (presetId: string) => void;
  saveState: SaveState;
  saveError: string | null;
  starredCount: number;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TeamsState>(() => {
    const loaded = loadTeams();
    if (loaded) return loaded;
    const t: Team = { id: makeTeamId(), name: "アダマス編成", roster: buildPresetRoster() };
    return { teams: [t], activeTeamId: t.id };
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
      const res = saveTeams(state);
      if (res.ok) {
        setSaveState("saved");
        setSaveError(null);
      } else {
        setSaveState("error");
        setSaveError(res.error ?? "不明なエラー");
      }
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [state]);

  const activeTeam = state.teams.find((t) => t.id === state.activeTeamId) ?? state.teams[0];
  const roster = activeTeam?.roster ?? [];

  // アクティブチームのロスターを更新
  const updateActiveRoster = useCallback((updater: (prev: RosterEntry[]) => RosterEntry[]) => {
    setState((prev) => ({
      ...prev,
      teams: prev.teams.map((t) => (t.id === prev.activeTeamId ? { ...t, roster: updater(t.roster) } : t)),
    }));
  }, []);

  const setRoster = useCallback<StoreCtx["setRoster"]>((updater) => {
    updateActiveRoster((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, [updateActiveRoster]);

  const updateEntry = useCallback<StoreCtx["updateEntry"]>((key, patch) => {
    updateActiveRoster((prev) =>
      prev.map((e) => {
        if (e.key !== key) return e;
        return typeof patch === "function" ? patch(e) : { ...e, ...patch };
      }),
    );
  }, [updateActiveRoster]);

  const removeEntry = useCallback((key: string) => {
    updateActiveRoster((prev) => prev.filter((e) => e.key !== key));
  }, [updateActiveRoster]);

  const addEntry = useCallback((entry: RosterEntry) => {
    updateActiveRoster((prev) => [...prev, entry]);
  }, [updateActiveRoster]);

  const resetToPreset = useCallback(() => {
    updateActiveRoster(() => buildPresetRoster());
  }, [updateActiveRoster]);

  const setActiveTeam = useCallback((id: string) => {
    setState((prev) => (prev.teams.some((t) => t.id === id) ? { ...prev, activeTeamId: id } : prev));
  }, []);

  const createTeam = useCallback((name?: string) => {
    setState((prev) => {
      const t: Team = { id: makeTeamId(), name: name?.trim() || `チーム${prev.teams.length + 1}`, roster: [] };
      return { teams: [...prev.teams, t], activeTeamId: t.id };
    });
  }, []);

  const duplicateTeam = useCallback(() => {
    setState((prev) => {
      const src = prev.teams.find((t) => t.id === prev.activeTeamId);
      if (!src) return prev;
      const t: Team = { id: makeTeamId(), name: `${src.name}のコピー`, roster: cloneRoster(src.roster) };
      return { teams: [...prev.teams, t], activeTeamId: t.id };
    });
  }, []);

  const renameTeam = useCallback((name: string) => {
    const nm = name.trim();
    if (!nm) return;
    setState((prev) => ({
      ...prev,
      teams: prev.teams.map((t) => (t.id === prev.activeTeamId ? { ...t, name: nm } : t)),
    }));
  }, []);

  const removeTeam = useCallback(() => {
    setState((prev) => {
      if (prev.teams.length <= 1) return prev; // 最後の1チームは残す
      const rest = prev.teams.filter((t) => t.id !== prev.activeTeamId);
      return { teams: rest, activeTeamId: rest[0].id };
    });
  }, []);

  const loadPresetTeam = useCallback((presetId: string) => {
    const preset = PRESET_TEAMS.find((p) => p.id === presetId);
    const built = buildTeamPreset(presetId);
    if (!preset || !built) return;
    setState((prev) => {
      const t: Team = { id: makeTeamId(), name: preset.name, roster: built };
      return { teams: [...prev.teams, t], activeTeamId: t.id };
    });
  }, []);

  const starredCount = roster.filter((e) => e.starred).length;

  return (
    <Ctx.Provider
      value={{
        roster, setRoster, updateEntry, removeEntry, addEntry, resetToPreset,
        teams: state.teams, activeTeamId: state.activeTeamId, activeTeam,
        setActiveTeam, createTeam, duplicateTeam, renameTeam, removeTeam, loadPresetTeam,
        saveState, saveError, starredCount,
      }}
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
