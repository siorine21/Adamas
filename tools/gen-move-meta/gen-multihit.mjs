/* src/data/multiHit.ts（連続技の回数）を再生成するスクリプト。
 *
 *   node tools/gen-move-meta/gen-multihit.mjs
 *
 * 出典は PokeAPI の move_meta.csv（min_hits / max_hits）と move_names.csv。
 * MOVE_LIB に収録されている技だけを出力する。
 *
 * 回数が固定の技（ダブルウイング＝2回など）は [2, 2]、
 * 2〜5回の技（スケイルショット等）は [2, 5] になる。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const JA = "1";

function parseCsv(text) {
  const [head, ...rows] = text.trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}
const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
const fetchCsv = async (name) => {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
};

const [meta, names] = await Promise.all([fetchCsv("move_meta.csv"), fetchCsv("move_names.csv")]);
const jaById = new Map(
  names.filter((n) => n.local_language_id === JA).map((n) => [n.move_id, normalize(n.name)]),
);

/** MOVE_LIB にある技名（moves.ts を素のテキストとして読む） */
const lib = fs.readFileSync(path.join(ROOT, "src/data/moves.ts"), "utf8");
const inLib = (name) => lib.includes(`"${name}"`);

const rows = [];
for (const m of meta) {
  if (!m.min_hits || !m.max_hits) continue;
  const name = jaById.get(m.move_id);
  if (!name || !inLib(name)) continue;
  const lo = Number(m.min_hits), hi = Number(m.max_hits);
  if (!(hi > 1)) continue; // 1回だけの技は連続技ではない
  rows.push([name, lo, hi]);
}
rows.sort((a, b) => a[0].localeCompare(b[0], "ja"));

const out = `/* ---------- 連続技の回数 ----------
   出典: PokeAPI data/v2/csv/move_meta.csv（min_hits・max_hits）と move_names.csv。
   ・[最小回数, 最大回数]。固定回数の技は同じ値が2つ並ぶ（ダブルウイング = [2, 2]）。
   ・MOVE_LIB に収録している技のみ（${rows.length}技）。
   ・再生成: node tools/gen-move-meta/gen-multihit.mjs */
export const MULTI_HIT: Record<string, [number, number]> = {
${rows.map(([n, lo, hi]) => `  "${n}": [${lo}, ${hi}],`).join("\n")}
};
`;
fs.writeFileSync(path.join(ROOT, "src/data/multiHit.ts"), out);
console.log(`src/data/multiHit.ts を更新しました（${rows.length}技）`);
for (const [n, lo, hi] of rows) console.log(`  ${n}: ${lo === hi ? lo : `${lo}〜${hi}`}回`);
