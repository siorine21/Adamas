/*
 * gamewith_threat_moves.json（scrape-threats.cjs の出力）から
 * src/data/threatLearnsets.ts を生成する。被ダメ計算で仮想敵の技を「覚える技」に絞るためのデータ。
 *
 *   node tools/scrape-learnsets/gen-threat-learnsets.mjs
 *
 * ・技ライブラリ（moves.ts の MOVE_LIB）にある技名だけを、ライブラリの並び順で収録する
 * ・メガは元の姿の習得表を使う（MEGA_BASE）
 * ・はがね・あく系統は moves.ts の LEARNSETS（AppMedia＋実機確認の手当てつき）を
 *   アプリ側で優先するので、ここでは突き合わせだけ行い、差をログに出す
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { threatTargets } = require("./threat-targets.cjs");

const IN = "tools/scrape-learnsets/gamewith_threat_moves.json";
const OUT = "src/data/threatLearnsets.ts";
const data = JSON.parse(fs.readFileSync(IN, "utf8"));
const src = fs.readFileSync("src/data/moves.ts", "utf8");
const lib = [...src.slice(0, src.indexOf("/* ====")).matchAll(/M\("([^"]+)"/g)].map((m) => m[1]);
const order = new Map(lib.map((n, i) => [n, i]));

// はがね・あく系統の習得表（突き合わせ用）
const lsBlock = src.slice(src.indexOf("export const LEARNSETS"));
const verified = Object.fromEntries([...lsBlock.matchAll(/"([^"]+)": \{ status: "[^"]+", source: "[^"]*", moves: \[([^\]]*)\]/g)]
  .map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]));

const { targets, megaOf } = threatTargets();
const lines = [];
const unknown = new Map(); // ライブラリに無い技名 → 種族
const missing = [];
const report = [];
let count = 0;
for (const t of targets) {
  const got = data[t];
  if (!got || got.moves.length === 0) { missing.push(t); continue; }
  const moves = [...new Set(got.moves)].filter((m) => {
    if (order.has(m)) return true;
    unknown.set(m, [...(unknown.get(m) ?? []), t]);
    return false;
  }).sort((a, b) => order.get(a) - order.get(b));
  lines.push(`  ${JSON.stringify(t)}: ${JSON.stringify(moves.join(" "))},`);
  count++;
  // はがね・あく系統は既存の習得表と比べる（フォルム名を外した名前でも引く）
  const vkey = verified[t] ? t : verified[t.replace(/[(（].*$/, "")] ? t.replace(/[(（].*$/, "") : null;
  if (vkey) {
    const a = new Set(verified[vkey]), b = new Set(moves);
    const onlyGw = moves.filter((m) => !a.has(m));
    const onlyLs = verified[vkey].filter((m) => !b.has(m));
    report.push(`${t}: ${onlyGw.length || onlyLs.length ? `差あり 今回だけ[${onlyGw.join(" ")}] 既存だけ[${onlyLs.join(" ")}]` : "一致"}`);
  }
}

const megaLines = Object.entries(megaOf).map(([m, b]) => `  ${JSON.stringify(m)}: ${JSON.stringify(b)},`);
const out = `/* ============================================================
   内定ポケモン全種族の習得技（ポケモンチャンピオンズで覚える技）
   出典: GameWith のチャンピオンズ各ポケモン個別ページ「〜が覚える技」
        tools/scrape-learnsets/scrape-threats.cjs で取得し、
        tools/scrape-learnsets/gen-threat-learnsets.mjs で生成（手で書き換えない）。
   ・技名は空白区切り。技ライブラリ（MOVE_LIB）にある技だけを収録
   ・はがね・あく系統は moves.ts の LEARNSETS（実機確認の手当てつき）を優先して使う
   ============================================================ */

/** メガシンカ → 元の姿（習得技は元の姿と同じ） */
export const MEGA_BASE: Record<string, string> = {
${megaLines.join("\n")}
};

/** 種族（内定表の名前）→ 覚える技（空白区切り） */
export const THREAT_LEARNSETS: Record<string, string> = {
${lines.join("\n")}
};
`;
fs.writeFileSync(OUT, out);
console.log(`習得表 ${count}/${targets.length}種族を収録 → ${OUT}`);
if (missing.length) console.log(`未収録 ${missing.length}: ${missing.join(" ")}`);
if (unknown.size) console.log(`ライブラリに無い技 ${unknown.size}: ${[...unknown].map(([m, ts]) => `${m}(${ts.length})`).join(" ")}`);
if (report.length) console.log(`\nはがね・あく系統の突き合わせ\n${report.join("\n")}`);
