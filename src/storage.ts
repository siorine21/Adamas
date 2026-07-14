import type { RosterEntry } from "./types";

const STORAGE_KEY = "adamas-koubou/roster/v1";
const SCHEMA_VERSION = 1;

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Envelope {
  version: number;
  savedAt: string;
  roster: RosterEntry[];
}

export function loadRoster(): RosterEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Envelope;
    if (!data || !Array.isArray(data.roster)) return null;
    return data.roster;
  } catch (e) {
    console.error("ロスターの読み込みに失敗しました", e);
    return null;
  }
}

export function saveRoster(roster: RosterEntry[]): { ok: boolean; error?: string } {
  try {
    const envelope: Envelope = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      roster,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ロスターの保存に失敗しました", e);
    return { ok: false, error: msg };
  }
}

/** JSONエクスポート文字列（クリップボード用） */
export function exportJSON(roster: RosterEntry[]): string {
  const envelope: Envelope = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    roster,
  };
  return JSON.stringify(envelope, null, 2);
}

/** JSONインポート（貼り付け復元用）。roster配列 or Envelope両対応 */
export function importJSON(text: string): { ok: boolean; roster?: RosterEntry[]; error?: string } {
  try {
    const data = JSON.parse(text);
    let roster: unknown;
    if (Array.isArray(data)) roster = data;
    else if (data && Array.isArray(data.roster)) roster = data.roster;
    else return { ok: false, error: "roster 配列が見つかりません" };
    const arr = roster as RosterEntry[];
    // 最低限の形状チェック
    for (const e of arr) {
      if (typeof e.name !== "string" || !Array.isArray(e.forms) || !e.ap) {
        return { ok: false, error: "個体データの形式が不正です" };
      }
    }
    return { ok: true, roster: arr };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `JSON の解析に失敗: ${msg}` };
  }
}
