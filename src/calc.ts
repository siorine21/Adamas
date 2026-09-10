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

/** 補正を掛け合わせる（4096基準の固定小数点。本家と同じ丸め）。
 *  順に掛けるのではなく一度に合成するので、途中の丸め誤差が出ない。 */
function chainMods(mods: number[]): number {
  let m = 4096;
  for (const mod of mods) if (mod !== 4096) m = (m * mod + 2048) >> 12;
  return m;
}
/** 倍率(1.3など)を4096基準の補正値に直す */
const M = (x: number): number => Math.round(x * 4096);
/** 4096基準の補正を適用（五捨五超入） */
const applyMod = (v: number, mod: number): number => pokeRound((v * mod) / 4096);

export function computeDamage(p: DamageParams): DamageResult | null {
  const {
    power, moveName, atkStat, defStat, atkRank, defRank, moveType: rawMoveType, atkTypes, defTypes,
    category, item, defItem, crit, weather, field, burn, wall, contact,
    atkAbility, defAbility, defHPFull, helpingHand, spread,
    atkStatused, defStatused, atkPinch, atkMovesLast, rivalry, protect, extraMul,
  } = p;
  if (!power || power <= 0) return null;

  // スカイスキン（メガボーマンダ）: ノーマル技がひこう技になる。
  // 相性・無効化・タイプ一致もひこうで判定するので、ここで型を差し替える。
  const skin = atkAbility === "スカイスキン" && rawMoveType === "ノーマル";
  const moveType = skin ? "ひこう" : rawMoveType;

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

  let eff = 1;
  for (const t of defTypes) {
    const m = (CHART[moveType] || {})[t];
    if (m !== undefined) eff *= m;
  }
  if (eff === 0) return { rolls: [], eff, immune: true };

  /* ---------- ① 威力補正（技の威力にかかるもの・まとめて1回だけ丸める） ---------- */
  // 条件で威力が変わる技（威力そのものが置き換わるもの）
  let basePower = power;
  if (moveName === "しっぺがえし" && atkMovesLast) basePower *= 2;

  const bpMods: number[] = [];
  // 条件で威力が変わる技（補正として掛かるもの）
  if (moveName === "からげんき" && atkStatused) bpMods.push(M(2));
  if (moveName === "はたきおとす" && defItem !== "（なし）" && defItem !== "") bpMods.push(M(1.5));
  // テクニシャンは「元の威力が60以下か」で判定する
  if (atkAbility === "テクニシャン" && basePower <= 60) bpMods.push(M(1.5));
  if (atkAbility === "メガランチャー" && flags.includes("pulse")) bpMods.push(M(1.5));
  if (atkAbility === "がんじょうあご" && flags.includes("bite")) bpMods.push(M(1.5));
  if (atkAbility === "きれあじ" && SLICING_MOVES.has(moveName)) bpMods.push(M(1.5));
  if (atkAbility === "ちからずく") bpMods.push(5325);
  if (atkAbility === "すなのちから" && weather === "すなあらし"
      && ["いわ", "じめん", "はがね"].includes(moveType)) bpMods.push(5325);
  if (atkAbility === "アナライズ" && atkMovesLast) bpMods.push(5325);
  if (atkAbility === "かたいツメ" && contact) bpMods.push(5325);
  if (atkAbility === "パンクロック" && flags.includes("sound")) bpMods.push(5325);
  if (atkAbility === "とうそうしん" && rivalry === "同性") bpMods.push(M(1.25));
  if (atkAbility === "とうそうしん" && rivalry === "異性") bpMods.push(M(0.75));
  if (skin) bpMods.push(4915); // スカイスキン
  if (atkAbility === "すてみ" && RECOIL_MOVES.has(moveName)) bpMods.push(4915);
  if (atkAbility === "てつのこぶし" && flags.includes("punch")) bpMods.push(4915);
  if (dAbil === "たいねつ" && moveType === "ほのお") bpMods.push(M(0.5));
  if (helpingHand) bpMods.push(M(1.5));
  if (item === "タイプ強化アイテム") bpMods.push(4915);
  if (item === "ノーマルジュエル" && moveType === "ノーマル") bpMods.push(5325);
  // フィールド（設置側・被弾側ともに地上にいる前提）
  if (field === "エレキフィールド" && moveType === "でんき") bpMods.push(5325);
  if (field === "サイコフィールド" && moveType === "エスパー") bpMods.push(5325);
  if (field === "グラスフィールド" && moveType === "くさ") bpMods.push(5325);
  if (field === "グラスフィールド" && GROUND_QUAKE.has(moveName)) bpMods.push(M(0.5));
  if (field === "ミストフィールド" && moveType === "ドラゴン") bpMods.push(M(0.5));
  const pow = Math.max(1, applyMod(basePower, chainMods(bpMods)));

  /* ---------- ② 攻撃の補正 ---------- */
  let aRank = atkRank, dRank = defRank;
  if (crit) { aRank = Math.max(0, aRank); dRank = Math.min(0, dRank); }
  let A = rankMul(atkStat, aRank);
  // はりきりだけは連鎖に入らず単独で掛かる
  if (atkAbility === "はりきり" && category === "物理") A = pokeRound((A * 3) / 2);
  const atMods: number[] = [];
  if (atkAbility === "ちからもち" || atkAbility === "ヨガパワー") atMods.push(M(2));
  if (atkAbility === "こんじょう" && atkStatused) atMods.push(M(1.5));
  if (atkAbility === "サンパワー" && category === "特殊" && weather === "にほんばれ") atMods.push(M(1.5));
  // ピンチ特性（自分のHPが1/3以下で該当タイプの攻撃が1.5倍）
  const PINCH: Record<string, string> = {
    "しんりょく": "くさ", "もうか": "ほのお", "げきりゅう": "みず", "むしのしらせ": "むし",
  };
  if (PINCH[atkAbility] && atkPinch && moveType === PINCH[atkAbility]) atMods.push(M(1.5));
  if (dAbil === "あついしぼう" && (moveType === "ほのお" || moveType === "こおり")) atMods.push(M(0.5));
  if (item === "こだわりハチマキ" && category === "物理") atMods.push(M(1.5));
  if (item === "こだわりメガネ" && category === "特殊") atMods.push(M(1.5));
  A = Math.max(1, applyMod(A, chainMods(atMods)));

  /* ---------- ③ 防御の補正 ---------- */
  let D = rankMul(defStat, dRank);
  // 天候による防御補正（すなあらし=いわのD1.5 / ゆき=こおりのB1.5）は連鎖の前
  if (weather === "すなあらし" && defTypes.includes("いわ") && category === "特殊") D = Math.floor(D * 1.5);
  if (weather === "ゆき" && defTypes.includes("こおり") && category === "物理") D = Math.floor(D * 1.5);
  const dfMods: number[] = [];
  if (dAbil === "ふしぎなうろこ" && defStatused && category === "物理") dfMods.push(M(1.5));
  if (dAbil === "ファーコート" && category === "物理") dfMods.push(M(2));
  if (defItem === "とつげきチョッキ" && category === "特殊") dfMods.push(M(1.5));
  if (defItem === "しんかのきせき") dfMods.push(M(1.5));
  D = Math.max(1, applyMod(D, chainMods(dfMods)));

  /* ---------- ④ 基本ダメージ（乱数の前にかかる補正） ---------- */
  let base = Math.floor(Math.floor(Math.floor(22 * pow * A / D) / 50) + 2);
  if (spread) base = applyMod(base, 3072); // 複数体攻撃 0.75倍
  if (weather === "にほんばれ") {
    if (moveType === "ほのお") base = applyMod(base, 6144);
    if (moveType === "みず") base = applyMod(base, 2048);
  } else if (weather === "あまごい") {
    if (moveType === "みず") base = applyMod(base, 6144);
    if (moveType === "ほのお") base = applyMod(base, 2048);
  }
  if (crit) base = Math.floor(base * 1.5);

  /* ---------- ⑤ 最終補正（乱数のあと・まとめて1回だけ丸める） ---------- */
  const finalMods: number[] = [];
  if (wall && !crit) finalMods.push(spread ? 2732 : 2048);
  if (atkAbility === "スナイパー" && crit) finalMods.push(M(1.5));
  if (item === "いのちのたま") finalMods.push(5324);
  if (item === "たつじんのおび" && eff > 1) finalMods.push(4915);
  if (dAbil === "フィルター／ハードロック／プリズムアーマー" && eff > 1) finalMods.push(3072);
  if (dAbil === "マルチスケイル" && defHPFull) finalMods.push(M(0.5));
  if (dAbil === "こおりのりんぷん" && category === "特殊") finalMods.push(M(0.5));
  if (dAbil === "もふもふ" && contact) finalMods.push(M(0.5));
  if (dAbil === "はどうのぼうご" && contact) finalMods.push(M(0.5));
  if (dAbil === "パンクロック" && flags.includes("sound")) finalMods.push(M(0.5));
  if (dAbil === "もふもふ" && moveType === "ほのお") finalMods.push(M(2));
  if (extraMul !== 1) finalMods.push(M(extraMul));
  const finalMod = chainMods(finalMods);

  // リベロ／へんげんじざい・スカイスキンは撃つ技のタイプになるので常にタイプ一致
  const sameType = atkTypes.includes(moveType) || skin
    || atkAbility === "リベロ／へんげんじざい";
  const stabMod = sameType ? (atkAbility === "てきおうりょく" ? 8192 : 6144) : 4096;

  const rolls: number[] = [];
  for (let r = 85; r <= 100; r++) {
    let d = Math.floor(base * r / 100);
    if (stabMod !== 4096) d = (d * stabMod) / 4096;
    d = Math.floor(pokeRound(d) * eff);
    // からげんきは やけどの物理半減を受けない。こんじょうも同様。
    if (burn && category === "物理" && atkAbility !== "こんじょう" && moveName !== "からげんき") d = Math.floor(d / 2);
    rolls.push(pokeRound(Math.max(1, (d * finalMod) / 4096)));
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
