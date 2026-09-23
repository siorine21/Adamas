/* searchBulk（耐久調整の逆算）を、全部の組み合わせを試す方法と突き合わせる。
 *
 *   npx esbuild src/attack.ts --bundle --format=esm --outfile=tools/verify-damage/attack.mjs
 *   node tools/verify-damage/verify-bulk.mjs
 *
 * 逆算は「防御に振るほど耐えやすい」ことを前提に二分探索で手を抜いている。
 * H 33 × 防御 33 = 1089 通りを全部試して、合計が最小のものと一致するかを見る。
 * あわせて1回あたりの時間も測る（画面で気持ちよく動くか）。 */
import { analyzeAttack, koChanceWithin, searchBulk } from "./attack.mjs";

const calcStat = (base, ap, mod) => Math.floor((Math.floor((base * 2 + 31 + ap * 2) * 50 / 100) + 5) * mod);
const calcHP = (base, ap) => Math.floor((base * 2 + 31 + ap * 2) * 50 / 100) + 60;

let pass = 0, fail = 0;
function check(name, { baseH, baseDef, defMod = 1, atkStat, power, moveName = "＿", actions = 1, extra = {}, budget = 64 }) {
  const survive = (h, d) => {
    const hp = calcHP(baseH, h);
    const a = analyzeAttack({
      power, moveName, atkStat, defStat: calcStat(baseDef, d, defMod),
      atkRank: 0, defRank: 0, moveType: "ノーマル", atkTypes: ["ノーマル"], defTypes: ["エスパー"], // ノーマル技に等倍（半減だと何を振っても耐えてしまい逆算を試せない）
      category: "物理", item: "", defItem: extra.defItem ?? "", crit: false, weather: "なし", field: "なし",
      burn: false, wall: false, contact: false, atkAbility: "", defAbility: extra.defAbility ?? "",
      helpingHand: false, spread: false, atkStatused: false, defStatused: false, atkPinch: false,
      atkMovesLast: false, rivalry: "なし", alliesFainted: 0, protect: false, extraMul: extra.mul ?? 1,
    }, hp, { startFull: true, stealthRock: !!extra.sr, hits: extra.hits ?? "auto", maxActions: actions });
    return koChanceWithin(a.ko, actions) === 0;
  };

  const t0 = performance.now();
  const got = searchBulk(survive, budget);
  const ms = performance.now() - t0;

  // 総当たり: 合計最小、同じならHが多いほう
  let want = null;
  for (let h = 0; h <= 32; h++) for (let d = 0; d <= 32; d++) {
    if (h + d > budget || !survive(h, d)) continue;
    if (!want || h + d < want.h + want.d || (h + d === want.h + want.d && h > want.h)) want = { h, d };
  }
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (same) pass++; else fail++;
  const f = (x) => (x ? `H${x.h} B${x.d}（合計${x.h + x.d}）` : "耐えられない");
  console.log(`${same ? "OK" : "NG"} ${name}: 逆算 ${f(got)} / 総当たり ${f(want)}  [${ms.toFixed(1)}ms]`);
}

// メタグロス（H80 B130）が A200 の威力120物理技を受ける想定。
// 補正倍率を少しずつ上げて、「振らなくても耐える」〜「振っても耐えない」の間を全部なめる
for (let mul = 1.2; mul <= 2.15; mul += 0.1) {
  const m = Math.round(mul * 10) / 10;
  check(`1発耐え 補正×${m}`, { baseH: 80, baseDef: 130, atkStat: 200, power: 120, extra: { mul: m } });
}
for (let mul = 0.6; mul <= 1.15; mul += 0.1) {
  const m = Math.round(mul * 10) / 10;
  check(`2発耐え 補正×${m}`, { baseH: 80, baseDef: 130, atkStat: 200, power: 120, actions: 2, extra: { mul: m } });
}
check("予算が少ない（合計20まで）", { baseH: 80, baseDef: 130, atkStat: 200, power: 120, extra: { mul: 1.6 }, budget: 20 });
check("ステロ込み", { baseH: 80, baseDef: 130, atkStat: 200, power: 120, extra: { mul: 1.6, sr: true } });
check("タスキ（1発耐えは常に成立）", { baseH: 60, baseDef: 60, atkStat: 250, power: 150, extra: { mul: 4, defItem: "きあいのタスキ" } });
check("予算で届かない（合計36必要・20まで）", { baseH: 80, baseDef: 130, atkStat: 200, power: 120, extra: { mul: 1.8 }, budget: 20 });
// 連続技（2〜5回を確率込み）はいちばん計算が重いので、答えが中ほどに来る強さで試す
for (const m of [1.6, 1.8, 2.0, 2.2]) {
  check(`2〜5回の連続技 補正×${m}`, { baseH: 80, baseDef: 130, atkStat: 200, power: 25, moveName: "スケイルショット", extra: { mul: m } });
}
for (const m of [0.8, 0.9, 1.0]) {
  check(`2〜5回の連続技・2発耐え 補正×${m}`, { baseH: 80, baseDef: 130, atkStat: 200, power: 25, moveName: "スケイルショット", actions: 2, extra: { mul: m } });
}

console.log(`\n一致 ${pass} / 不一致 ${fail}`);
if (fail) process.exit(1);
