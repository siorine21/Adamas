import { CHART, pokeRound, rankMul } from "./data/game";

export type Weather = "なし" | "にほんばれ" | "あまごい";

export interface DamageParams {
  power: number;
  atkStat: number;
  defStat: number;
  atkRank: number;
  defRank: number;
  moveType: string;
  atkTypes: string[];
  defTypes: string[];
  category: "物理" | "特殊";
  item: string;
  defItem: string;
  crit: boolean;
  weather: Weather;
  burn: boolean;
  wall: boolean;
  contact: boolean;
  atkAbility: string;
  defAbility: string;
  defHPFull: boolean;
}

export interface DamageResult {
  rolls: number[];
  eff: number;
  immune?: boolean;
}

export function computeDamage(p: DamageParams): DamageResult | null {
  const {
    power, atkStat, defStat, atkRank, defRank, moveType, atkTypes, defTypes,
    category, item, defItem, crit, weather, burn, wall, contact,
    atkAbility, defAbility, defHPFull,
  } = p;
  if (!power || power <= 0) return null;

  let aRank = atkRank, dRank = defRank;
  if (crit) { aRank = Math.max(0, aRank); dRank = Math.min(0, dRank); }
  let A = rankMul(atkStat, aRank);
  let D = rankMul(defStat, dRank);
  if (item === "こだわりハチマキ" && category === "物理") A = Math.floor(A * 1.5);
  if (item === "こだわりメガネ" && category === "特殊") A = Math.floor(A * 1.5);
  if (defItem === "とつげきチョッキ" && category === "特殊") D = Math.floor(D * 1.5);

  let eff = 1;
  for (const t of defTypes) {
    const m = (CHART[moveType] || {})[t];
    if (m !== undefined) eff *= m;
  }
  if (eff === 0) return { rolls: [], eff, immune: true };

  let base = Math.floor(Math.floor(Math.floor(22 * power * A / D) / 50)) + 2;
  if (weather === "にほんばれ") {
    if (moveType === "ほのお") base = Math.floor(base * 1.5);
    if (moveType === "みず") base = Math.floor(base * 0.5);
  } else if (weather === "あまごい") {
    if (moveType === "みず") base = Math.floor(base * 1.5);
    if (moveType === "ほのお") base = Math.floor(base * 0.5);
  }
  if (crit) base = Math.floor(base * 1.5);

  const stab = atkTypes.includes(moveType)
    ? (atkAbility === "てきおうりょく" ? 2.0 : 1.5)
    : 1.0;
  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let d = Math.floor(base * r / 100);
    if (stab > 1) d = pokeRound(d * stab);
    d = Math.floor(d * eff);
    if (burn && category === "物理") d = Math.floor(d * 0.5);
    if (wall && !crit) d = pokeRound(d * 0.5);
    if (atkAbility === "かたいツメ" && contact) d = pokeRound(d * 1.3);
    if (atkAbility === "ちからもち") d = pokeRound(d * 2.0);
    if (atkAbility === "ちからずく") d = pokeRound(d * 1.3);
    if (item === "いのちのたま") d = pokeRound(d * 5324 / 4096);
    if (item === "たつじんのおび" && eff > 1) d = pokeRound(d * 1.2);
    if (defAbility === "フィルター／ハードロック／プリズムアーマー" && eff > 1) d = pokeRound(d * 0.75);
    if (defAbility === "マルチスケイル" && defHPFull) d = pokeRound(d * 0.5);
    if (d < 1) d = 1;
    rolls.push(d);
  }
  return { rolls, eff, immune: false };
}

export interface KoResult {
  min: number;
  max: number;
  verdict: string;
  detail: string;
  minPct: number;
  maxPct: number;
}

/* 確定数解析：16分岐一様乱数のDP（残存HP分布、確率は全体基準） */
export function koAnalysis(rolls: number[], hp: number): KoResult | null {
  if (!rolls.length) return null;
  const min = rolls[0], max = rolls[rolls.length - 1];
  let dist = new Map<number, number>([[hp, 1]]);
  const result: { n: number; cum: number }[] = [];
  let cumKO = 0;
  for (let n = 1; n <= 10; n++) {
    const next = new Map<number, number>();
    let ko = 0;
    for (const [rem, prob] of dist) {
      for (const d of rolls) {
        const nr = rem - d;
        const pp = prob / 16;
        if (nr <= 0) ko += pp;
        else next.set(nr, (next.get(nr) || 0) + pp);
      }
    }
    cumKO += ko;
    result.push({ n, cum: cumKO });
    dist = next;
    if (cumKO >= 0.999999) break;
  }
  let verdict = "", detail = "";
  for (const r of result) if (r.cum >= 0.999999) { verdict = `確定${r.n}発`; break; }
  const firstChance = result.find((r) => r.cum > 0);
  if (firstChance && verdict !== `確定${firstChance.n}発`) {
    detail = `乱数${firstChance.n}発（${(firstChance.cum * 100).toFixed(1)}%）`;
  }
  if (!verdict) verdict = "確定10発超";
  return { min, max, verdict, detail, minPct: (min / hp) * 100, maxPct: (max / hp) * 100 };
}

/* タイプ相性倍率（表示・ステロ計算共用） */
export function typeEffectiveness(moveType: string, defTypes: string[]): number {
  let eff = 1;
  for (const t of defTypes) {
    const m = (CHART[moveType] || {})[t];
    if (m !== undefined) eff *= m;
  }
  return eff;
}

export function effLabel(eff: number): string {
  if (eff === 0) return "こうかがない（無効）";
  if (eff >= 4) return "こうかばつぐん（4倍）";
  if (eff > 1) return "こうかばつぐん（2倍）";
  if (eff === 1) return "等倍";
  if (eff <= 0.25) return "いまひとつ（1/4）";
  return "いまひとつ（1/2）";
}

/* ステルスロック等の設置ダメージ（最大HPの1/8 × タイプ相性） */
export function hazardDamage(hp: number, moveType: string, defTypes: string[]): number {
  const eff = typeEffectiveness(moveType, defTypes);
  return Math.floor(hp / 8 * eff);
}
