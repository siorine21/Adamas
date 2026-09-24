/* koAnalysis（確定数のDP）を、全部の乱数の並びを数え上げる素朴な方法と突き合わせる。
 *
 *   npx esbuild src/calc.ts --bundle --format=esm --outfile=tools/verify-damage/ours.mjs
 *   node tools/verify-damage/verify-ko.mjs
 *
 * DP は「残りHPの分布」をまとめて持つので速いが、連続技・タスキ・ばけのかわ・
 * ステロ・マルチスケイルが絡むと取り違えやすい。こちらは1本ずつ道筋をたどるだけなので、
 * 遅いかわりに間違えようがない。両者が一致すればDPは正しい。 */
import { koAnalysis, MULTI_HIT_WEIGHTS } from "./ours.mjs";

/** 16乱数（85〜100%）をそれっぽく作る */
const rollsOf = (base) => Array.from({ length: 16 }, (_, i) => Math.floor(base * (85 + i) / 100));

/** 1本ずつたどる。schedule[n] は n 回目の行動の「回数ごとの候補」 */
function brute(hp, schedule, o) {
  const cum = [];
  // 状態: { rem, p, disguise, first }
  let states = [{ rem: Math.max(0, hp - (o.preDamage ?? 0)), p: 1, disguise: !!o.disguise, first: true }];
  let ko = 0;
  for (const action of schedule) {
    const nextStates = [];
    for (const s of states) {
      for (const { weight, hits } of action) {
        // この行動の全発を、乱数の並びごとに展開する
        let paths = [{ ...s, p: s.p * weight }];
        for (let i = 0; i < hits.length; i++) {
          const np = [];
          for (const q of paths) {
            if (q.rem <= 0) { np.push(q); continue; } // もう倒れている
            if (q.first && q.disguise) {
              np.push({ ...q, rem: q.rem - Math.floor(hp / 8), disguise: false, first: false });
              continue;
            }
            const rs = q.rem === hp && q.first && o.fullHpFirst ? o.fullHpFirst : hits[i];
            for (const d of rs) {
              let nr = q.rem - d;
              if (o.sturdy && q.rem === hp && nr <= 0) nr = 1;
              np.push({ ...q, rem: nr, p: q.p / rs.length, first: false });
            }
          }
          paths = np;
        }
        for (const q of paths) {
          if (q.rem <= 0) ko += q.p;
          else nextStates.push({ ...q, first: false, disguise: false });
        }
      }
    }
    states = nextStates;
    cum.push(ko);
  }
  return cum;
}

let pass = 0, fail = 0;
function check(name, hp, rolls, opts, nActions) {
  const got = koAnalysis(rolls, hp, opts);
  const actions = opts.actions ?? [{ weight: 1, hits: [rolls] }];
  const want = brute(hp, Array(nActions).fill(actions), opts);
  const ok = want.every((w, i) => Math.abs((got.cum[i] ?? 1) - w) < 1e-9);
  if (ok) pass++; else fail++;
  const fmt = (a) => a.map((x) => (x * 100).toFixed(2)).join(" / ");
  console.log(`${ok ? "OK" : "NG"} ${name}: ${got.verdict} ${got.detail}`);
  if (!ok) console.log(`    DP  : ${fmt(got.cum.slice(0, nActions))}\n    総当: ${fmt(want)}`);
}

const r60 = rollsOf(60);   // 51〜60
const r40 = rollsOf(40);
const r100 = rollsOf(100);

// --- 単発（以前と同じ結果になること） ---
check("単発・乱数2発", 110, r60, {}, 3);
check("単発・確定1発", 50, r60, {}, 1);

// --- 連続技 ---
check("2回固定", 150, r40, { actions: [{ weight: 1, hits: [r40, r40] }] }, 2);
check("3回固定", 150, r40, { actions: [{ weight: 1, hits: [r40, r40, r40] }] }, 2);
check("トリプルアクセル型（威力が発ごとに上がる）", 150, r40,
  { actions: [{ weight: 1, hits: [rollsOf(20), rollsOf(40), rollsOf(60)] }] }, 2);
const random25 = [2, 3, 4, 5].map((k) => ({ weight: MULTI_HIT_WEIGHTS[k], hits: Array(k).fill(r40) }));
check("2〜5回ランダム（1行動）", 150, r40, { actions: random25 }, 1);

// --- タスキ／がんじょう ---
check("タスキ（単発で落ちる一撃を1で耐える）", 50, r60, { sturdy: true }, 2);
check("タスキ＋連続技（2発目で落ちる）", 50, r40, { sturdy: true, actions: [{ weight: 1, hits: [r40, r40] }] }, 1);
check("タスキ＋ステロ（満タンでないので発動しない）", 50, r60, { sturdy: true, preDamage: 6 }, 2);

// --- ばけのかわ ---
check("ばけのかわ（1発目は1/8だけ）", 120, r60, { disguise: true }, 3);
check("ばけのかわ＋連続技（2発目から通る）", 120, r40, { disguise: true, actions: [{ weight: 1, hits: [r40, r40] }] }, 2);

// --- ステロ ---
check("ステロ込み（乱数2発→確定2発に変わる幅）", 110, r60, { preDamage: 13 }, 2);
check("ステロだけで倒れる寸前", 20, r60, { preDamage: 19 }, 1);

// --- マルチスケイル（満タンの1発目だけ半減） ---
const half = r100.map((d) => Math.floor(d / 2));
check("マルチスケイル（2発目は半減しない）", 160, r100, { fullHpFirst: half }, 2);
check("マルチスケイル＋ステロ（満タンでないので半減しない）", 160, r100, { fullHpFirst: half, preDamage: 20 }, 2);
check("マルチスケイル＋連続技", 160, r40, { fullHpFirst: r40.map((d) => Math.floor(d / 2)), actions: [{ weight: 1, hits: [r40, r40] }] }, 2);

/* 2〜5回ランダムを複数行動ぶん。総当たりは 16^(最大15) で数え切れないので、
   乱数を振って数える（20万回。誤差はおおむね±0.3%に収まる） */
{
  const hp = 260;
  const N = 200000;
  const counts = [0, 0, 0];
  // mulberry32。素朴な LCG は seed*1103515245 が 2^53 を超えて精度が落ち、
  // 偏った乱数になる（それで2%ずれた）ので、32bit 演算だけで閉じるものを使う
  let seed = 12345;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pickK = () => { const x = rnd(); return x < 0.35 ? 2 : x < 0.70 ? 3 : x < 0.85 ? 4 : 5; };
  for (let t = 0; t < N; t++) {
    let rem = hp;
    for (let n = 0; n < 3 && rem > 0; n++) {
      const k = pickK();
      for (let i = 0; i < k && rem > 0; i++) rem -= r40[Math.floor(rnd() * 16)];
      if (rem <= 0) for (let m = n; m < 3; m++) counts[m]++;
    }
  }
  const got = koAnalysis(r40, hp, { actions: random25 });
  let ok = true;
  const lines = [];
  for (let n = 0; n < 3; n++) {
    const mc = counts[n] / N;
    const dp = got.cum[n] ?? 1;
    if (Math.abs(mc - dp) > 0.005) ok = false;
    lines.push(`${n + 1}発目 DP ${(dp * 100).toFixed(2)}% / 試行 ${(mc * 100).toFixed(2)}%`);
  }
  if (ok) pass++; else fail++;
  console.log(`${ok ? "OK" : "NG"} 2〜5回ランダム（3行動・乱数試行20万回）: ${got.verdict} ${got.detail}`);
  for (const l of lines) console.log(`    ${l}`);
}

console.log(`\n一致 ${pass} / 不一致 ${fail}`);
if (fail) process.exit(1);
