import { CHART, pokeRound, rankMul } from "./data/game";
import { MOVE_FLAGS } from "./data/moveFlags";
import { RECOIL_MOVES, SLICING_MOVES } from "./data/moves";

export type Weather = "なし" | "にほんばれ" | "あまごい" | "すなあらし" | "ゆき";
export type Field = "なし" | "エレキフィールド" | "グラスフィールド" | "サイコフィールド" | "ミストフィールド";

/** グラスフィールドで半減される地面技（地面を揺らす技） */
const GROUND_QUAKE = new Set(["じしん", "じならし", "マグニチュード"]);

export interface DamageParams {
  power: number;
  moveName: string;
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
  field: Field;
  burn: boolean;
  wall: boolean;
  contact: boolean;
  atkAbility: string;
  defAbility: string;
  defHPFull: boolean;
  /** てだすけ（味方の支援）で1.5倍 */
  helpingHand: boolean;
  /** ダブルで複数体を同時に攻撃する技（0.75倍） */
  spread: boolean;
  /** 攻撃側が状態異常（こんじょう・ふしぎなうろこの条件） */
  atkStatused: boolean;
  /** 防御側が状態異常（ふしぎなうろこの条件） */
  defStatused: boolean;
  /** 攻撃側のHPが1/3以下（しんりょく・もうか・げきりゅう・むしのしらせの条件） */
  atkPinch: boolean;
  /** 攻撃側が後攻（アナライズの条件） */
  atkMovesLast: boolean;
  /** とうそうしん: 同性 / 異性 / なし */
  rivalry: "なし" | "同性" | "異性";
  /** 相手が まもる／みきり を使っている（貫通特性以外は無効） */
  protect: boolean;
  /** 実装外の補正（チャンピオンズ独自の特性など）を手で掛ける */
  extraMul: number;
}

export interface DamageResult {
  rolls: number[];
  eff: number;
  immune?: boolean;
  /** 無効になった理由（特性など）。表示に使う */
  immuneReason?: string;
}

/** 防御側の特性による無効化。かたやぶりなら無視される */
function immunityByAbility(defAbility: string, moveType: string, moveName: string): string | null {
  const flags = MOVE_FLAGS[moveName] ?? "";
  if (defAbility === "ふゆう" && moveType === "じめん") return "ふゆう";
  if (defAbility === "もらいび" && moveType === "ほのお") return "もらいび";
  if (defAbility === "ちくでん" && moveType === "でんき") return "ちくでん";
  if (defAbility === "ちょすい" && moveType === "みず") return "ちょすい";
  if (defAbility === "そうしょく" && moveType === "くさ") return "そうしょく";
  if (defAbility === "ぼうおん" && flags.includes("sound")) return "ぼうおん";
  if (defAbility === "ぼうだん" && flags.includes("ball")) return "ぼうだん";
  return null;
}

export function computeDamage(p: DamageParams): DamageResult | null {
  const {
    power, moveName, atkStat, defStat, atkRank, defRank, moveType, atkTypes, defTypes,
    category, item, defItem, crit, weather, field, burn, wall, contact,
    atkAbility, defAbility, defHPFull, helpingHand, spread,
    atkStatused, defStatused, atkPinch, atkMovesLast, rivalry, protect, extraMul,
  } = p;
  if (!power || power <= 0) return null;

  const flags = MOVE_FLAGS[moveName] ?? "";
  // かたやぶり: 防御側の特性（無効化・軽減）を無視する
  const breaks = atkAbility === "かたやぶり";
  const dAbil = breaks ? "" : defAbility;

  // ふうせん（レギュM-Cで解禁）。持ち物なので かたやぶり では無視されない
  if (defItem === "ふうせん" && moveType === "じめん") {
    return { rolls: [], eff: 0, immune: true, immuneReason: "ふうせん" };
  }

  const reason = immunityByAbility(dAbil, moveType, moveName);
  if (reason) return { rolls: [], eff: 0, immune: true, immuneReason: reason };

  // まもる／みきり。ふかしのこぶし（＝かんつうドリル）の接触技だけが貫通する
  const piercesProtect = atkAbility === "ふかしのこぶし" || atkAbility === "かんつうドリル";
  if (protect && !(piercesProtect && contact)) {
    return { rolls: [], eff: 0, immune: true, immuneReason: "まもる" };
  }

  let aRank = atkRank, dRank = defRank;
  if (crit) { aRank = Math.max(0, aRank); dRank = Math.min(0, dRank); }
  let A = rankMul(atkStat, aRank);
  let D = rankMul(defStat, dRank);

  // 攻撃側の実数値補正
  if (atkAbility === "ちからもち" || atkAbility === "ヨガパワー") A = Math.floor(A * 2);
  if (atkAbility === "はりきり" && category === "物理") A = Math.floor(A * 1.5);
  if (atkAbility === "こんじょう" && atkStatused) A = Math.floor(A * 1.5);
  if (atkAbility === "サンパワー" && category === "特殊" && weather === "にほんばれ") A = Math.floor(A * 1.5);
  if (item === "こだわりハチマキ" && category === "物理") A = Math.floor(A * 1.5);
  if (item === "こだわりメガネ" && category === "特殊") A = Math.floor(A * 1.5);

  // 防御側の実数値補正
  if (defItem === "とつげきチョッキ" && category === "特殊") D = Math.floor(D * 1.5);
  if (defItem === "しんかのきせき") D = Math.floor(D * 1.5);
  if (dAbil === "ふしぎなうろこ" && defStatused && category === "物理") D = Math.floor(D * 1.5);
  // 天候による防御補正（すなあらし=いわのD1.5 / ゆき=こおりのB1.5）
  if (weather === "すなあらし" && defTypes.includes("いわ") && category === "特殊") D = Math.floor(D * 1.5);
  if (weather === "ゆき" && defTypes.includes("こおり") && category === "物理") D = Math.floor(D * 1.5);

  let eff = 1;
  for (const t of defTypes) {
    const m = (CHART[moveType] || {})[t];
    if (m !== undefined) eff *= m;
  }
  if (eff === 0) return { rolls: [], eff, immune: true };

  // 威力補正（技の威力そのものにかかるもの）
  let pow = power;
  if (atkAbility === "てつのこぶし" && flags.includes("punch")) pow = pokeRound(pow * 1.2);
  if (atkAbility === "メガランチャー" && flags.includes("pulse")) pow = pokeRound(pow * 1.5);
  if (atkAbility === "がんじょうあご" && flags.includes("bite")) pow = pokeRound(pow * 1.5);
  if (atkAbility === "きれあじ" && SLICING_MOVES.has(moveName)) pow = pokeRound(pow * 1.5);
  if (atkAbility === "すてみ" && RECOIL_MOVES.has(moveName)) pow = pokeRound(pow * 1.2);
  if (atkAbility === "すなのちから" && weather === "すなあらし"
      && ["いわ", "じめん", "はがね"].includes(moveType)) pow = pokeRound(pow * 1.3);
  if (atkAbility === "アナライズ" && atkMovesLast) pow = pokeRound(pow * 1.3);
  if (atkAbility === "とうそうしん" && rivalry === "同性") pow = pokeRound(pow * 1.25);
  if (atkAbility === "とうそうしん" && rivalry === "異性") pow = pokeRound(pow * 0.75);
  if (helpingHand) pow = pokeRound(pow * 1.5);
  // フィールド（設置側・被弾側ともに地上にいる前提）
  if (field === "エレキフィールド" && moveType === "でんき") pow = pokeRound(pow * 1.3);
  if (field === "サイコフィールド" && moveType === "エスパー") pow = pokeRound(pow * 1.3);
  if (field === "グラスフィールド" && moveType === "くさ") pow = pokeRound(pow * 1.3);
  if (field === "グラスフィールド" && GROUND_QUAKE.has(moveName)) pow = pokeRound(pow * 0.5);
  if (field === "ミストフィールド" && moveType === "ドラゴン") pow = pokeRound(pow * 0.5);

  let base = Math.floor(Math.floor(Math.floor(22 * pow * A / D) / 50)) + 2;
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
  // ピンチ特性（自分のHPが1/3以下で該当タイプ1.5倍）
  const PINCH: Record<string, string> = {
    "しんりょく": "くさ", "もうか": "ほのお", "げきりゅう": "みず", "むしのしらせ": "むし",
  };
  const pinchType = PINCH[atkAbility];

  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let d = Math.floor(base * r / 100);
    if (stab > 1) d = pokeRound(d * stab);
    d = Math.floor(d * eff);
    if (burn && category === "物理" && atkAbility !== "こんじょう") d = Math.floor(d * 0.5);
    if (wall && !crit) d = pokeRound(d * (spread ? 2732 / 4096 : 0.5));
    if (pinchType && atkPinch && moveType === pinchType) d = pokeRound(d * 1.5);
    if (atkAbility === "かたいツメ" && contact) d = pokeRound(d * 1.3);
    if (atkAbility === "ちからずく") d = pokeRound(d * 1.3);
    if (atkAbility === "スナイパー" && crit) d = pokeRound(d * 1.5);
    if (item === "いのちのたま") d = pokeRound(d * 5324 / 4096);
    if (item === "たつじんのおび" && eff > 1) d = pokeRound(d * 1.2);
    if (item === "タイプ強化アイテム") d = pokeRound(d * 1.2);
    if (item === "ノーマルジュエル" && moveType === "ノーマル") d = pokeRound(d * 1.3);
    if (dAbil === "フィルター／ハードロック／プリズムアーマー" && eff > 1) d = pokeRound(d * 0.75);
    if (dAbil === "マルチスケイル" && defHPFull) d = pokeRound(d * 0.5);
    if (dAbil === "ファーコート" && category === "物理") d = pokeRound(d * 0.5);
    if (dAbil === "こおりのりんぷん" && category === "特殊") d = pokeRound(d * 0.5);
    if (dAbil === "もふもふ" && contact) d = pokeRound(d * 0.5);
    if (dAbil === "はどうのぼうご" && contact) d = pokeRound(d * 0.5);
    if (dAbil === "もふもふ" && moveType === "ほのお") d = pokeRound(d * 2);
    if (dAbil === "たいねつ" && moveType === "ほのお") d = pokeRound(d * 0.5);
    if (dAbil === "あついしぼう" && (moveType === "ほのお" || moveType === "こおり")) d = pokeRound(d * 0.5);
    if (spread) d = pokeRound(d * 0.75);
    if (extraMul !== 1) d = pokeRound(d * extraMul);
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
