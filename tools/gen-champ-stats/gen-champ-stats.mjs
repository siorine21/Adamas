/* src/data/champStats.ts（チャンピオンズ版の命中率・PP）を再生成するスクリプト。
 *
 *   node tools/gen-champ-stats/gen-champ-stats.mjs
 *
 * 出典は GameWith の「技（わざ）一覧」＋各ポケモン個別ページ
 * （tools/scrape-learnsets/scrape-gamewith.cjs の出力 gamewith_move_stats.json）。
 *
 * チャンピオンズは本編から PP を作り直していて、本編値からの単純な換算にもならない
 * （本編10でも まもる→8 / のろい→12）。PP 列を持つ出典は GameWith だけなので、
 * ここを唯一の出典として MOVE_META（PokeAPI＝本編値）に上書きをかける。
 *
 * 本編と同じ値は書き出さない（差分だけを持つ）ので、取得できた技が増えても
 * ファイルは必要なぶんしか育たない。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const stats = JSON.parse(read("tools/scrape-learnsets/gamewith_move_stats.json"));

// MOVE_LIB の収録技と並び順（moves.ts を素のテキストとして読む。gen-learnsets と同じ作法）
const movesSrc = read("src/data/moves.ts");
const lib = [...movesSrc.slice(0, movesSrc.indexOf("/* ====")).matchAll(/M\("([^"]+)"/g)].map((m) => m[1]);
const order = new Map(lib.map((n, i) => [n, i]));

// 本編の命中率・PP
const meta = new Map(
  [...read("src/data/moveMeta.ts").matchAll(/^ {2}"([^"]+)": \[(\d+), (\d+)\],$/gm)]
    .map((m) => [m[1], { acc: Number(m[2]), pp: Number(m[3]) }]));

const rows = [];
const unknown = [];
for (const name of lib) {
  const gw = stats[name];
  if (!gw) continue;
  const base = meta.get(name);
  if (!base) { unknown.push(name); continue; }
  // GameWith の「-」は命中判定なし。MOVE_META では 0 で表す
  const acc = gw.acc === null ? 0 : gw.acc;
  const diff = {};
  if (acc !== base.acc) diff.acc = acc;
  if (gw.pp !== base.pp) diff.pp = gw.pp;
  if (Object.keys(diff).length === 0) continue;
  rows.push([name, diff]);
}
rows.sort((a, b) => (order.get(a[0]) ?? 9999) - (order.get(b[0]) ?? 9999));

const body = rows.map(([name, d]) => {
  const parts = [];
  if (d.acc !== undefined) parts.push(`acc: ${d.acc}`);
  if (d.pp !== undefined) parts.push(`pp: ${d.pp}`);
  return `  "${name}": { ${parts.join(", ")} },`;
}).join("\n");

const covered = lib.filter((n) => stats[n]).length;
const out = `/* ---------- チャンピオンズ版の命中率・PP（本編との差分） ----------
   出典: GameWith「ポケモンチャンピオンズ 技（わざ）一覧」および各ポケモン個別ページ。
        tools/scrape-learnsets/scrape-gamewith.cjs で取得 → 本ファイルを自動生成。
   ・MOVE_META（PokeAPI＝本編値）に対する上書き。本編と同じ値は載せない。
   ・命中率 0 は「必中（命中判定なし）」。GameWith の「-」がこれに当たる。
   ・照合できた技 ${covered}/${lib.length} のうち、差があるのは ${rows.length} 技。
     未照合の技は本編値のままなので、PP がずれている可能性がある。
   ・再生成: node tools/gen-champ-stats/gen-champ-stats.mjs */
export const CHAMP_STATS: Record<string, { acc?: number; pp?: number }> = {
${body}
};
`;
fs.writeFileSync(path.join(ROOT, "src/data/champStats.ts"), out);
if (unknown.length) console.warn(`MOVE_META に無い技 ${unknown.length} 件:`, unknown.join(", "));
console.log(`src/data/champStats.ts を更新しました（照合 ${covered}技 / 差分 ${rows.length}技）。`);
