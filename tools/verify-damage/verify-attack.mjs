/* analyzeAttack（連続技・ステロ・マルチスケイルを含めた確定数）を検算する。
 *
 *   npx esbuild src/attack.ts --bundle --format=esm --outfile=tools/verify-damage/attack.mjs
 *   node tools/verify-damage/verify-attack.mjs
 *
 * 答え合わせの作り方:
 *   ・1発ごとのダメージ（16乱数）は本家 @smogon/calc に出させる（計算式の正しさはこちらで担保）
 *   ・それを何発当てると倒れるかは、ここで「合計ダメージの分布を畳み込む」素朴な方法で出す
 *     （確定数のDPとは別の、もっと単純な数え方なので、DPの取り違えを拾える）
 *
 * 本家の kochance() の確率そのものは比べない。本家は
 *   ・5発以上だと確率を出さない（"possible 5HKO"）
 *   ・連続技の確率は近似（"approx."）
 *   ・マルチスケイルを2発目以降にも掛けたまま数える
 * ので、正解として使えないため。n（何発目から倒せる可能性があるか）の目安にだけ使う。
 *
 * タスキ・がんじょう・ばけのかわ は verify-ko.mjs の総当たりで確認している。 */
import pkg from "@smogon/calc";
const { Generations, Pokemon, Move, Field, calculate } = pkg;
import { analyzeAttack } from "./attack.mjs";

const gen = Generations.get(9);
const JP_TYPE = {
  Normal: "ノーマル", Fire: "ほのお", Water: "みず", Electric: "でんき", Grass: "くさ",
  Ice: "こおり", Fighting: "かくとう", Poison: "どく", Ground: "じめん", Flying: "ひこう",
  Psychic: "エスパー", Bug: "むし", Rock: "いわ", Ghost: "ゴースト", Dragon: "ドラゴン",
  Dark: "あく", Steel: "はがね", Fairy: "フェアリー",
};

/** 本家に1発ごとの16乱数を出させる。連続技は発ごとの配列を返す */
function smogonHits(sc, extraDefOpts = {}, hits) {
  const attacker = new Pokemon(gen, sc.atk, sc.atkOpts ?? {});
  const defender = new Pokemon(gen, sc.def, { ...(sc.defOpts ?? {}), ...extraDefOpts });
  const move = new Move(gen, sc.move, { ...(sc.moveOpts ?? {}), ...(hits ? { hits } : {}) });
  const res = calculate(gen, attacker, defender, move, new Field());
  const d = res.damage;
  return { hits: Array.isArray(d[0]) ? d : [d], hp: defender.maxHP(), res, attacker, defender, move };
}

/** 合計ダメージの分布を畳み込んで、各行動の後に倒れている確率を出す。
 *  schedule: 行動ごとに [{weight, hits:[乱数配列...]}]（回数がランダムなら候補を並べる） */
function convolve(target, schedule) {
  const cap = (x) => Math.min(x, target); // target 以上は「倒れた」でまとめる
  let dist = new Map([[0, 1]]);
  const cum = [];
  for (const action of schedule) {
    const next = new Map();
    for (const { weight, hits } of action) {
      let d = dist;
      for (const rolls of hits) {
        const nd = new Map();
        for (const [sum, p] of d) {
          if (sum >= target) { nd.set(sum, (nd.get(sum) || 0) + p); continue; }
          for (const r of rolls) {
            const s = cap(sum + r);
            nd.set(s, (nd.get(s) || 0) + p / rolls.length);
          }
        }
        d = nd;
      }
      for (const [s, p] of d) next.set(s, (next.get(s) || 0) + p * weight);
    }
    dist = next;
    cum.push(dist.get(target) || 0);
  }
  return cum;
}

const W = { 2: 0.35, 3: 0.35, 4: 0.15, 5: 0.15 };
let pass = 0, fail = 0;

function run(name, sc) {
  const base = smogonHits(sc, {}, sc.smogonHits);
  const { res, attacker, defender, move } = base;
  const hp = base.hp;
  const physical = move.category === "Physical";
  const sr = !!sc.stealthRock;
  const pre = sr ? Math.floor(hp / 8 * (sc.srEff ?? 1)) : 0;

  const got = analyzeAttack({
    power: move.bp,
    moveName: sc.jpMove,
    atkStat: physical ? attacker.rawStats.atk : attacker.rawStats.spa,
    defStat: physical ? defender.rawStats.def : defender.rawStats.spd,
    atkRank: 0, defRank: 0,
    moveType: JP_TYPE[move.type],
    atkTypes: attacker.types.map((t) => JP_TYPE[t]),
    defTypes: defender.types.map((t) => JP_TYPE[t]),
    category: physical ? "物理" : "特殊",
    item: "", defItem: "",
    crit: false, weather: "なし", field: "なし", burn: false, wall: false,
    contact: !!move.flags?.contact,
    atkAbility: sc.jpAtkAbility ?? "", defAbility: sc.jpDefAbility ?? "",
    helpingHand: false, spread: false, atkStatused: false, defStatused: false,
    atkPinch: false, atkMovesLast: false, rivalry: "なし", alliesFainted: 0,
    protect: false, extraMul: 1,
  }, hp, { startFull: true, stealthRock: sr, hits: sc.hits ?? "auto" });

  // 期待値の組み立て（本家の1発ごとの乱数を使う）
  const N = sc.actions ?? 4;
  let schedule;
  if (sc.random) {
    const per = base.hits[0];
    schedule = Array(N).fill([2, 3, 4, 5].map((k) => ({ weight: W[k], hits: Array(k).fill(per) })));
  } else {
    schedule = Array(N).fill([{ weight: 1, hits: base.hits }]);
  }
  if (sc.multiscaleFirst && !sr) {
    // 満タンで受ける1発目だけマルチスケイル。2発目からは特性なしの乱数（本家に別に出させる）
    const full = smogonHits(sc, { ability: "Multiscale" }).hits[0];
    const first = [{ weight: 1, hits: [full, ...base.hits.slice(1)] }];
    schedule = [first, ...schedule.slice(1)];
  }
  const want = convolve(hp - pre, schedule);

  const ok = want.every((w, i) => Math.abs((got.ko?.cum[i] ?? 1) - w) < 1e-9);
  if (ok) pass++; else fail++;
  const fmt = (a) => a.slice(0, N).map((x) => `${(x * 100).toFixed(1)}%`).join(" / ");
  console.log(`${ok ? "OK" : "NG"} ${name}: ${got.ko?.verdict} ${got.ko?.detail}`);
  if (!ok) console.log(`    当方: ${fmt(got.ko?.cum ?? [])}\n    期待: ${fmt(want)}`);
  console.log(`    （参考）本家の表示: ${res.kochance().text}`);
}

const S = { level: 50, nature: "Adamant", evs: { atk: 252 } };
const D = { level: 50, nature: "Bold", evs: { hp: 252, def: 252 } };
const B = { level: 50, nature: "Bold", evs: { hp: 4 } };

// --- 連続技 ---
run("スケイルショット 5回固定", { atk: "Garchomp", atkOpts: S, def: "Corviknight", defOpts: B, move: "Scale Shot", smogonHits: 5, jpMove: "スケイルショット", hits: 5 });
run("スケイルショット 3回固定", { atk: "Garchomp", atkOpts: S, def: "Corviknight", defOpts: B, move: "Scale Shot", smogonHits: 3, jpMove: "スケイルショット", hits: 3, actions: 6 });
run("スケイルショット 2〜5回（確率込み）", { atk: "Garchomp", atkOpts: S, def: "Corviknight", defOpts: B, move: "Scale Shot", smogonHits: 5, jpMove: "スケイルショット", random: true });
run("ダブルウイング（2回固定）", { atk: "Dragonite", atkOpts: S, def: "Kingambit", defOpts: B, move: "Dual Wingbeat", smogonHits: 2, jpMove: "ダブルウイング", actions: 6 });
run("スキルリンク つららばり（常に5回）", { atk: "Cloyster", atkOpts: { ...S, ability: "Skill Link" }, def: "Kingambit", defOpts: D, move: "Icicle Spear", smogonHits: 5, jpMove: "つららばり", jpAtkAbility: "スキルリンク" });
run("トリプルアクセル（威力20→40→60）", { atk: "Weavile", atkOpts: S, def: "Kingambit", defOpts: D, move: "Triple Axel", smogonHits: 3, jpMove: "トリプルアクセル" });

// --- ステルスロック込み ---
run("ステロ込み（単発・等倍）", { atk: "Garchomp", atkOpts: S, def: "Kingambit", defOpts: D, move: "Earthquake", jpMove: "じしん", stealthRock: true, srEff: 0.5 });
run("ステロ込み（4倍弱点の相手）", { atk: "Kingambit", atkOpts: S, def: "Volcarona", defOpts: D, move: "Iron Head", jpMove: "アイアンヘッド", stealthRock: true, srEff: 4 });

// --- マルチスケイル（満タンの1発目だけ半減） ---
run("マルチスケイル（2発目からは半減しない）", { atk: "Kingambit", atkOpts: S, def: "Dragonite", defOpts: D, move: "Iron Head", jpMove: "アイアンヘッド", jpDefAbility: "マルチスケイル", multiscaleFirst: true });
run("マルチスケイル＋ステロ（満タンでないので半減しない）", { atk: "Kingambit", atkOpts: S, def: "Dragonite", defOpts: D, move: "Iron Head", jpMove: "アイアンヘッド", jpDefAbility: "マルチスケイル", multiscaleFirst: true, stealthRock: true, srEff: 2 });

console.log(`\n一致 ${pass} / 不一致 ${fail}`);
if (fail) process.exit(1);
