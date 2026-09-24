/* ============================================================
   1回の攻撃を、確定数まで含めて解析する。
   ダメージ計算の本体（calc.ts の computeDamage / koAnalysis）は1発ぶんの
   乱数と、それを何発当てるかの計算に分かれている。ここでその2つをつなぎ、
   次のものをまとめて扱う。

     ・連続技（回数固定／2〜5回ランダム／スキルリンク／トリプル系の威力上昇）
     ・HP満タンのときだけ効くもの（マルチスケイル・きあいのタスキ・がんじょう）
     ・ばけのかわ（最初の1発を1/8に置き換える）
     ・ステルスロック（最初の行動の前に受ける）

   ダメージ計算タブの結果表示・技の一括計算・耐久調整の逆算が、
   すべてここを通るので、同じ条件なら同じ答えになる。
   ============================================================ */
import {
  computeDamage, hazardDamage, koAnalysis, MULTI_HIT_WEIGHTS,
  type DamageParams, type DamageResult, type KoAction, type KoResult,
} from "./calc";
import { MULTI_HIT } from "./data/multiHit";

/** 連続技の回数の指定。"auto" は技の既定（固定回数・2〜5回ならランダム・スキルリンクなら最大） */
export type HitsChoice = "auto" | number;

/** 発ごとに威力が上がる技（本編どおり 元の威力 × 何発目） */
const ESCALATING = new Set(["トリプルアクセル", "トリプルキック"]);
/** 連続技だが、この計算では扱えないもの（威力が味方の攻撃で決まる） */
const UNSUPPORTED_MULTI = new Set(["ふくろだたき"]);

export interface HitsInfo {
  /** 選べる回数の範囲 */
  min: number;
  max: number;
  /** 回数がランダム（2〜5回）で、確率込みで計算しているか */
  random: boolean;
  /** 今の計算で使っている回数（ランダムなら undefined） */
  fixed?: number;
  /** 発ごとに威力が上がる（トリプルアクセル等） */
  escalating: boolean;
}

/** 技の連続回数。連続技でなければ undefined */
export function hitsInfo(moveName: string, atkAbility: string, choice: HitsChoice): HitsInfo | undefined {
  const range = MULTI_HIT[moveName];
  if (!range || UNSUPPORTED_MULTI.has(moveName)) return undefined;
  const escalating = ESCALATING.has(moveName);
  // トリプル系は1発ごとに命中判定があり、外れるとそこで止まるので1回から選べるようにする
  const min = escalating ? 1 : range[0];
  const max = range[1];
  if (typeof choice === "number") {
    const k = Math.max(min, Math.min(max, choice));
    return { min, max, random: false, fixed: k, escalating };
  }
  if (atkAbility === "スキルリンク" || range[0] === range[1]) {
    return { min, max, random: false, fixed: max, escalating };
  }
  return { min, max, random: true, escalating };
}

export interface AttackExtras {
  /** 最初の攻撃を受ける前はHP満タンか（マルチスケイル・タスキ・がんじょうの前提） */
  startFull: boolean;
  /** ステルスロックを踏んでから受ける */
  stealthRock: boolean;
  /** 連続技の回数 */
  hits: HitsChoice;
  /** 何回の行動まで調べるか（逆算で何度も回すときに小さくする） */
  maxActions?: number;
}

export interface AttackAnalysis {
  /** 1発目の計算（乱数16個の表示などに使う）。技が無効なら immune */
  result: DamageResult | null;
  ko: KoResult | null;
  hits?: HitsInfo;
  /** 「既定」を選んだときの回数（選択肢のラベル用。今の選択に左右されない） */
  hitsAuto?: HitsInfo;
  /** ステロで最初に受けるダメージ（0なら無し） */
  preDamage: number;
  /** 判定に入れた効果（画面の注記用） */
  notes: string[];
}

/** n回の行動以内に倒れる確率。
 *  確定数のDPは「確定で倒れた」時点で打ち切るので、cum が n より短いときは
 *  その手前で確定している＝1。技が無効などで ko が無ければ倒れない＝0。
 *  （cum[n-1] ?? 0 と書くと、確定1発の相手を「2発耐える」と誤判定する） */
export function koChanceWithin(ko: KoResult | null, n: number): number {
  if (!ko) return 0;
  return ko.cum[n - 1] ?? 1;
}

export interface BulkPlan {
  /** HPに振るAP */
  h: number;
  /** 防御（物理技なら B、特殊技なら D）に振るAP */
  d: number;
}

/** 確定で耐えるための H と B（または D）のAPを、合計が最小になるよう探す。
 *
 *  survive(h, d) は「HにhAP・防御にdAP振ったとき確定で耐えるか」。
 *  H を固定すれば、防御に振るほど受けるダメージは減る（耐えやすくなる）ので、
 *  防御側は二分探索できる。H 33通り × 二分探索 6回 ほどで済む。
 *  合計が同じなら H を多めにとる（HPは物理・特殊どちらにも効くため）。
 *
 *  budget は H と防御に回せるAPの合計（66 − ほかの能力に振っているぶん）。
 *  届かなければ null。 */
export function searchBulk(
  survive: (h: number, d: number) => boolean, budget: number, maxEach = 32,
): BulkPlan | null {
  let best: BulkPlan | null = null;
  for (let h = Math.min(maxEach, budget); h >= 0; h--) {
    const dMax = Math.min(maxEach, budget - h);
    if (dMax < 0 || !survive(h, dMax)) continue; // この H では防御を振り切っても耐えない
    let lo = 0, hi = dMax; // survive(h, hi) は真。最小の d を探す
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (survive(h, mid)) hi = mid; else lo = mid + 1;
    }
    if (!best || h + lo < best.h + best.d) best = { h, d: lo };
  }
  return best;
}

/** 防御側の最大HP・タイプなどは params から読む（defHPFull は中で決める） */
export function analyzeAttack(
  params: Omit<DamageParams, "defHPFull">,
  hp: number,
  extras: AttackExtras,
): AttackAnalysis {
  const notes: string[] = [];
  const moldBreaker = params.atkAbility === "かたやぶり";
  const preDamage = extras.stealthRock ? hazardDamage(hp, "いわ", params.defTypes) : 0;
  const startFull = extras.startFull && preDamage === 0;

  const calc = (power: number, full: boolean) =>
    computeDamage({ ...params, power, defHPFull: full });

  // 1発目。表示用の乱数はこれ（満タンで受けるならマルチスケイル込み）
  const first = calc(params.power, startFull);
  if (!first || first.immune) {
    return { result: first, ko: null, preDamage, notes };
  }

  // 連続技の組み立て
  const hi = hitsInfo(params.moveName, params.atkAbility, extras.hits);
  const normalRolls = calc(params.power, false)?.rolls ?? first.rolls;
  const rollsFor = (i: number): number[] =>
    hi?.escalating ? (calc(params.power * (i + 1), false)?.rolls ?? normalRolls) : normalRolls;
  const hitsOf = (k: number) => Array.from({ length: k }, (_, i) => rollsFor(i));

  let actions: KoAction[];
  if (!hi) actions = [{ weight: 1, hits: [normalRolls] }];
  else if (hi.random) {
    actions = [2, 3, 4, 5].map((k) => ({ weight: MULTI_HIT_WEIGHTS[k], hits: hitsOf(k) }));
    notes.push("2〜5回（出る確率込み）");
  } else {
    actions = [{ weight: 1, hits: hitsOf(hi.fixed ?? 1) }];
    notes.push(`${hi.fixed}回当たる`);
  }

  // HP満タンで受ける1発目だけ乱数が違う（マルチスケイル）
  const fullHpFirst = startFull ? first.rolls : undefined;

  // タスキ（持ち物なので かたやぶり でも消えない）／がんじょう（特性なので消える）
  const sash = params.defItem === "きあいのタスキ";
  const sturdyAbil = params.defAbility === "がんじょう" && !moldBreaker;
  const sturdy = startFull && (sash || sturdyAbil);
  // 連続技は1発目で1残っても2発目で倒れるので、耐えられるのは単発技だけ
  const multi = !!hi && (hi.random || (hi.fixed ?? 1) > 1);
  const sturdyName = sash ? "きあいのタスキ" : "がんじょう";
  if (sturdy) {
    notes.push(multi
      ? `${sturdyName}は1発目しか耐えない（連続技の2発目で破られる）`
      : `${sturdyName}で満タンからの一撃を耐える`);
  }
  else if ((sash || sturdyAbil) && preDamage > 0) notes.push(`ステロで満タンでないので${sash ? "タスキ" : "がんじょう"}は発動しない`);
  else if ((sash || sturdyAbil) && !extras.startFull) notes.push(`HP満タンでないので${sash ? "タスキ" : "がんじょう"}は発動しない`);

  const disguise = params.defAbility === "ばけのかわ" && !moldBreaker;
  if (disguise) notes.push("ばけのかわ（1発目は最大HPの1/8だけ）");
  if (preDamage > 0) notes.push(`ステルスロック込み（先に ${preDamage} 受ける）`);

  const ko = koAnalysis(first.rolls, hp, {
    actions,
    fullHpFirst,
    preDamage,
    sturdy,
    disguise,
    maxActions: extras.maxActions,
  });
  const hitsAuto = hi ? hitsInfo(params.moveName, params.atkAbility, "auto") : undefined;
  return { result: first, ko, hits: hi, hitsAuto, preDamage, notes };
}
