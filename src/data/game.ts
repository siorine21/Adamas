import type { StatBlock, StatKey } from "../types";

export const TYPES = [
  "ノーマル", "ほのお", "みず", "でんき", "くさ", "こおり", "かくとう", "どく", "じめん",
  "ひこう", "エスパー", "むし", "いわ", "ゴースト", "ドラゴン", "あく", "はがね", "フェアリー",
];

export const TYPE_COLORS: Record<string, string> = {
  "ノーマル": "#9fa19f", "ほのお": "#e56c3e", "みず": "#4a90d9", "でんき": "#f0c33c", "くさ": "#63b85c",
  "こおり": "#74cfc0", "かくとう": "#cd5f48", "どく": "#a05fa0", "じめん": "#b8925c", "ひこう": "#8caadc",
  "エスパー": "#e07098", "むし": "#a8b843", "いわ": "#b0a887", "ゴースト": "#6f5fa5", "ドラゴン": "#5a63c8",
  "あく": "#6e5a4e", "はがね": "#8ea2b4", "フェアリー": "#e8a8e0",
};

// 第6世代以降のタイプ相性表（攻撃側 → 防御側、記載なしは等倍）
export const CHART: Record<string, Record<string, number>> = {
  "ノーマル": { "いわ": 0.5, "ゴースト": 0, "はがね": 0.5 },
  "ほのお": { "ほのお": 0.5, "みず": 0.5, "くさ": 2, "こおり": 2, "むし": 2, "いわ": 0.5, "ドラゴン": 0.5, "はがね": 2 },
  "みず": { "ほのお": 2, "みず": 0.5, "くさ": 0.5, "じめん": 2, "いわ": 2, "ドラゴン": 0.5 },
  "でんき": { "みず": 2, "でんき": 0.5, "くさ": 0.5, "じめん": 0, "ひこう": 2, "ドラゴン": 0.5 },
  "くさ": { "ほのお": 0.5, "みず": 2, "くさ": 0.5, "どく": 0.5, "じめん": 2, "ひこう": 0.5, "むし": 0.5, "いわ": 2, "ドラゴン": 0.5, "はがね": 0.5 },
  "こおり": { "ほのお": 0.5, "みず": 0.5, "くさ": 2, "こおり": 0.5, "じめん": 2, "ひこう": 2, "ドラゴン": 2, "はがね": 0.5 },
  "かくとう": { "ノーマル": 2, "こおり": 2, "どく": 0.5, "ひこう": 0.5, "エスパー": 0.5, "むし": 0.5, "いわ": 2, "ゴースト": 0, "あく": 2, "はがね": 2, "フェアリー": 0.5 },
  "どく": { "くさ": 2, "どく": 0.5, "じめん": 0.5, "いわ": 0.5, "ゴースト": 0.5, "はがね": 0, "フェアリー": 2 },
  "じめん": { "ほのお": 2, "でんき": 2, "くさ": 0.5, "どく": 2, "ひこう": 0, "むし": 0.5, "いわ": 2, "はがね": 2 },
  "ひこう": { "でんき": 0.5, "くさ": 2, "かくとう": 2, "むし": 2, "いわ": 0.5, "はがね": 0.5 },
  "エスパー": { "かくとう": 2, "どく": 2, "エスパー": 0.5, "あく": 0, "はがね": 0.5 },
  "むし": { "ほのお": 0.5, "くさ": 2, "かくとう": 0.5, "どく": 0.5, "ひこう": 0.5, "エスパー": 2, "ゴースト": 0.5, "あく": 2, "はがね": 0.5, "フェアリー": 0.5 },
  "いわ": { "ほのお": 2, "こおり": 2, "かくとう": 0.5, "じめん": 0.5, "ひこう": 2, "むし": 2, "はがね": 0.5 },
  "ゴースト": { "ノーマル": 0, "エスパー": 2, "ゴースト": 2, "あく": 0.5 },
  "ドラゴン": { "ドラゴン": 2, "はがね": 0.5, "フェアリー": 0 },
  "あく": { "かくとう": 0.5, "エスパー": 2, "ゴースト": 2, "あく": 0.5, "フェアリー": 0.5 },
  "はがね": { "ほのお": 0.5, "みず": 0.5, "でんき": 0.5, "こおり": 2, "いわ": 2, "はがね": 0.5, "フェアリー": 2 },
  "フェアリー": { "ほのお": 0.5, "かくとう": 2, "どく": 0.5, "ドラゴン": 2, "あく": 2, "はがね": 0.5 },
};

export interface Nature {
  up?: StatKey;
  down?: StatKey;
}

export const NATURES: Record<string, Nature> = {
  "がんばりや（無補正）": {},
  "いじっぱり（A↑C↓）": { up: "A", down: "C" },
  "ひかえめ（C↑A↓）": { up: "C", down: "A" },
  "ようき（S↑C↓）": { up: "S", down: "C" },
  "おくびょう（S↑A↓）": { up: "S", down: "A" },
  "わんぱく（B↑C↓）": { up: "B", down: "C" },
  "ずぶとい（B↑A↓）": { up: "B", down: "A" },
  "しんちょう（D↑C↓）": { up: "D", down: "C" },
  "おだやか（D↑A↓）": { up: "D", down: "A" },
  "れいせい（C↑S↓）": { up: "C", down: "S" },
  "ゆうかん（A↑S↓）": { up: "A", down: "S" },
  "のんき（B↑S↓）": { up: "B", down: "S" },
  "なまいき（D↑S↓）": { up: "D", down: "S" },
};

export const STAT_KEYS: StatKey[] = ["H", "A", "B", "C", "D", "S"];
export const STAT_LABEL: Record<StatKey, string> = {
  H: "HP", A: "攻撃", B: "防御", C: "特攻", D: "特防", S: "素早さ",
};

export const AP_MAX_TOTAL = 66;
export const AP_MAX_EACH = 32;
export const MAX_STARRED = 6;
export const MAX_MOVES = 4;

/* ---------- 実数値計算（検証済み計算式） ---------- */
export const calcHP = (base: number, ap: number): number =>
  Math.floor((base * 2 + 31 + ap * 2) * 50 / 100) + 60;

export const calcStat = (base: number, ap: number, mod: number): number =>
  Math.floor((Math.floor((base * 2 + 31 + ap * 2) * 50 / 100) + 5) * mod);

export function realStats(base: StatBlock, ap: StatBlock, natureName: string): StatBlock {
  const nat = NATURES[natureName] || {};
  const out = {} as StatBlock;
  for (const k of STAT_KEYS) {
    if (k === "H") {
      out.H = calcHP(base.H, ap.H);
      continue;
    }
    let mod = 1.0;
    if (nat.up === k) mod = 1.1;
    if (nat.down === k) mod = 0.9;
    out[k] = calcStat(base[k], ap[k], mod);
  }
  return out;
}

export const rankMul = (stat: number, rank: number): number =>
  rank >= 0 ? Math.floor(stat * (2 + rank) / 2) : Math.floor(stat * 2 / (2 - rank));

// 五捨五超入
export const pokeRound = (x: number): number => (x % 1 > 0.5 ? Math.ceil(x) : Math.floor(x));
